using Twilio;
using Twilio.Jwt.AccessToken;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using PrivateChat.Data;
using PrivateChat.Hubs;

var onlineUsers = new ConcurrentDictionary<string, int>();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ChatDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("ChatDatabase")));

builder.Services.AddSignalR();

builder.Services.AddSingleton<PrivateChat.Services.PresenceService>();

builder.Services.AddAuthentication(
        CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "PrivateChatAuth";

        options.LoginPath = "/";

        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = 401;
            return Task.CompletedTask;
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () =>
{
    return Results.Redirect("/index.html");
});


// =========================
// LOGIN
// =========================

app.MapPost("/api/login", async (HttpContext httpContext) =>
{
    using var document =
        await System.Text.Json.JsonDocument.ParseAsync(
            httpContext.Request.Body);

    if (!document.RootElement.TryGetProperty(
            "password",
            out var passwordElement))
    {
        return Results.BadRequest("Password is required.");
    }

    var password =
        passwordElement.GetString();

    var userName = password switch
    {
        "9947" => "Tom",
        "0416" => "Myauuu",
        _ => null
    };

    if (userName == null)
    {
        return Results.Unauthorized();
    }

    var claims = new[]
    {
        new System.Security.Claims.Claim(
            System.Security.Claims.ClaimTypes.Name,
            userName)
    };

    var identity =
        new System.Security.Claims.ClaimsIdentity(
            claims,
            CookieAuthenticationDefaults.AuthenticationScheme);

    var principal =
        new System.Security.Claims.ClaimsPrincipal(identity);

    await httpContext.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal);

    return Results.Ok(new
    {
        userName
    });
})
.AllowAnonymous();


// =========================
// CURRENT USER
// =========================

app.MapGet("/api/me", (HttpContext httpContext) =>
{
    var userName =
        httpContext.User.Identity?.Name;

    return Results.Ok(new
    {
        userName
    });
})
.RequireAuthorization();

// =========================
// USER STATUS
// =========================

app.MapGet("/api/status", (
    PrivateChat.Services.PresenceService presence) =>
{
    return Results.Ok(new
    {
        Tom = presence.IsOnline("Tom"),
        Myauuu = presence.IsOnline("Myauuu")
    });
})
.RequireAuthorization();

// =========================
// LOAD MESSAGES
// =========================

app.MapGet("/api/messages", async (ChatDbContext db) =>
{
    var messages =
        await db.Messages
            .AsNoTracking()
            .Include(m => m.Reactions)
            .Include(m => m.ReplyToMessage)
            .OrderBy(m => m.SentAt)
            .Select(m => new
            {
                id = m.Id,

                sender = m.Sender,

                messageText = m.MessageText,

                sentAt = DateTime.SpecifyKind(m.SentAt, DateTimeKind.Utc),

                messageType = m.MessageType,

                filePath = m.FilePath,

                originalFileName =
                    m.OriginalFileName,

                editedAt = m.EditedAt,

                isDeleted = m.IsDeleted,

                deletedAt = m.DeletedAt,

                deliveredAt = m.DeliveredAt,

                seenAt = m.SeenAt,

                replyToMessageId =
                    m.ReplyToMessageId,

                replySender =
                    m.ReplyToMessage != null
                        ? m.ReplyToMessage.Sender
                        : null,

                replyText =
                    m.ReplyToMessage == null
                        ? null
                        : m.ReplyToMessage.IsDeleted
                            ? "This message was deleted"
                            : m.ReplyToMessage.MessageType == "image"
                                ? "📷 Photo"
                                : (
                                    m.ReplyToMessage.MessageText.Length > 100
                                        ? m.ReplyToMessage.MessageText.Substring(0, 100) + "..."
                                        : m.ReplyToMessage.MessageText
                                  ),

                reactions =
                    m.Reactions
                        .Select(r => new
                        {
                            user = r.User,
                            emoji = r.Emoji,
                            createdAt = r.CreatedAt
                        })
                        .ToList()
            })
            .ToListAsync();

    return Results.Ok(messages);
})
.RequireAuthorization();


// =========================
// IMAGE UPLOAD
// =========================

app.MapPost("/api/upload-image", async (
    HttpContext httpContext,
    IFormFile file) =>
{
    var userName =
        httpContext.User.Identity?.Name;

    if (string.IsNullOrEmpty(userName))
    {
        return Results.Unauthorized();
    }

    if (file == null || file.Length == 0)
    {
        return Results.BadRequest(
            "No image selected.");
    }

    const long maxFileSize =
        5 * 1024 * 1024;

    if (file.Length > maxFileSize)
    {
        return Results.BadRequest(
            "Image size must be 5 MB or smaller.");
    }

    var allowedTypes = new[]
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    if (!allowedTypes.Contains(
        file.ContentType))
    {
        return Results.BadRequest(
            "Only JPG, PNG, and WEBP images are allowed.");
    }

    var extension =
        Path.GetExtension(file.FileName)
            .ToLowerInvariant();

    var allowedExtensions = new[]
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    if (!allowedExtensions.Contains(
        extension))
    {
        return Results.BadRequest(
            "Invalid image extension.");
    }

    var uploadDirectory =
        Path.Combine(
            Directory.GetCurrentDirectory(),
            "ChatUploads");

    Directory.CreateDirectory(
        uploadDirectory);

    var fileName =
        $"{Guid.NewGuid():N}{extension}";

    var filePath =
        Path.Combine(
            uploadDirectory,
            fileName);

    await using var stream =
        new FileStream(
            filePath,
            FileMode.CreateNew);

    await file.CopyToAsync(stream);

    return Results.Ok(new
    {
        fileName,
        originalFileName =
            file.FileName
    });
})
.DisableAntiforgery()
.RequireAuthorization();


// =========================
// SECURE IMAGE VIEW
// =========================

app.MapGet("/api/images/{fileName}", (
    HttpContext httpContext,
    string fileName) =>
{
    var userName =
        httpContext.User.Identity?.Name;

    if (string.IsNullOrEmpty(userName))
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(fileName))
    {
        return Results.BadRequest();
    }

    var safeFileName =
        Path.GetFileName(fileName);

    var uploadDirectory =
        Path.Combine(
            Directory.GetCurrentDirectory(),
            "ChatUploads");

    var filePath =
        Path.Combine(
            uploadDirectory,
            safeFileName);

    if (!File.Exists(filePath))
    {
        return Results.NotFound();
    }

    var extension =
        Path.GetExtension(filePath)
            .ToLowerInvariant();

    var contentType =
        extension switch
        {
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => null
        };

    if (contentType == null)
    {
        return Results.BadRequest();
    }

    var stream =
        new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read);

    return Results.File(
        stream,
        contentType);
})
.RequireAuthorization();


// =========================
// SIGNALR CHAT HUB
// =========================

app.MapHub<ChatHub>("/chatHub")
    .RequireAuthorization();


// =========================
// TWILIO VIDEO TOKEN
// =========================

app.MapGet("/api/call/token", (
    HttpContext httpContext) =>
{
    var userName =
        httpContext.User.Identity?.Name;

    if (string.IsNullOrEmpty(userName))
    {
        return Results.Unauthorized();
    }

    var accountSid =
        Environment.GetEnvironmentVariable(
            "TWILIO_ACCOUNT_SID");

    var apiKey =
        Environment.GetEnvironmentVariable(
            "TWILIO_API_KEY");

    var apiSecret =
        Environment.GetEnvironmentVariable(
            "TWILIO_API_SECRET");

    if (
        string.IsNullOrEmpty(accountSid) ||
        string.IsNullOrEmpty(apiKey) ||
        string.IsNullOrEmpty(apiSecret))
    {
        return Results.Problem(
            "Twilio configuration is missing.");
    }

    var grant =
        new VideoGrant();

    var token =
        new Token(
            accountSid,
            apiKey,
            apiSecret,
            identity: userName,
            grants: new HashSet<IGrant>
            {
                grant
            });

    return Results.Ok(new
    {
        identity = userName,
        token = token.ToJwt()
    });
})
.RequireAuthorization();


app.Run();
