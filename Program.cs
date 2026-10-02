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

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
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

app.MapPost("/api/login", async (HttpContext httpContext) =>
{
    var form = await httpContext.Request.ReadFormAsync();

    var password = form["password"].ToString();

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

    var identity = new System.Security.Claims.ClaimsIdentity(
        claims,
        CookieAuthenticationDefaults.AuthenticationScheme);

    var principal =
        new System.Security.Claims.ClaimsPrincipal(identity);

    await httpContext.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal);

    return Results.Ok();
}).AllowAnonymous();

app.MapGet("/api/me", (HttpContext httpContext) =>
{
    var userName = httpContext.User.Identity?.Name;

    return Results.Ok(new
    {
        userName
    });
}).RequireAuthorization();

app.MapGet("/api/messages", async (ChatDbContext db) =>
{
    var messages = await db.Messages
        .OrderBy(m => m.SentAt)
        .ToListAsync();

    return Results.Ok(messages);
}).RequireAuthorization();

app.MapHub<ChatHub>("/chatHub")
    .RequireAuthorization();

app.MapGet("/api/call/token", (HttpContext httpContext) =>
{
    var userName = httpContext.User.Identity?.Name;

    if (string.IsNullOrEmpty(userName))
    {
        return Results.Unauthorized();
    }

    var accountSid =
        Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");

    var apiKey =
        Environment.GetEnvironmentVariable("TWILIO_API_KEY");

    var apiSecret =
        Environment.GetEnvironmentVariable("TWILIO_API_SECRET");

    if (
        string.IsNullOrEmpty(accountSid) ||
        string.IsNullOrEmpty(apiKey) ||
        string.IsNullOrEmpty(apiSecret)
    )
    {
        return Results.Problem(
            "Twilio configuration is missing."
        );
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
            }
        );

    return Results.Ok(new
    {
        identity = userName,
        token = token.ToJwt()
    });
})
.RequireAuthorization();

app.Run();
