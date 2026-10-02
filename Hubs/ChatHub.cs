using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PrivateChat.Data;
using PrivateChat.Models;
using PrivateChat.Services;

namespace PrivateChat.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly ChatDbContext _db;
    private readonly PresenceService _presence;

    private static readonly Dictionary<string, string> ConnectedUsers = new();

    private static readonly object UserLock = new();


    public ChatHub(
        ChatDbContext db,
        PresenceService presence)
    {
        _db = db;
        _presence = presence;
    }


    /* =========================
       CONNECT
       ========================= */

    public override async Task OnConnectedAsync()
    {
        var userName =
            Context.User?.Identity?.Name;


        if (!string.IsNullOrEmpty(userName))
        {
            lock (UserLock)
            {
                ConnectedUsers[userName] =
                    Context.ConnectionId;
            }


            await Clients.Caller.SendAsync(
                "CurrentUserStatuses",
                new
                {
                    Tom =
                        _presence.IsOnline("Tom"),

                    Myauuu =
                        _presence.IsOnline("Myauuu")
                }
            );


            var becameOnline =
                _presence.UserConnected(
                    userName
                );


            if (becameOnline)
            {
                await Clients.All.SendAsync(
                    "UserStatusChanged",
                    userName,
                    true
                );
            }
        }


        await base.OnConnectedAsync();
    }


    /* =========================
       DISCONNECT
       ========================= */

    public override async Task OnDisconnectedAsync(
        Exception? exception)
    {
        var userName =
            Context.User?.Identity?.Name;


        if (!string.IsNullOrEmpty(userName))
        {
            lock (UserLock)
            {
                if (
                    ConnectedUsers.TryGetValue(
                        userName,
                        out var connectionId
                    )
                    &&
                    connectionId ==
                    Context.ConnectionId
                )
                {
                    ConnectedUsers.Remove(
                        userName
                    );
                }
            }


            var becameOffline =
                _presence.UserDisconnected(
                    userName
                );


            if (becameOffline)
            {
                await Clients.All.SendAsync(
                    "UserStatusChanged",
                    userName,
                    false
                );
            }
        }


        await base.OnDisconnectedAsync(
            exception
        );
    }


    /* =========================
       SEND MESSAGE
       ========================= */

    public async Task SendMessage(
        string messageText)
    {
        if (
            string.IsNullOrWhiteSpace(
                messageText
            )
        )
        {
            return;
        }


        if (messageText.Length > 2000)
        {
            throw new HubException(
                "Message is too long."
            );
        }


        var sender =
            Context.User?.Identity?.Name;


        if (string.IsNullOrEmpty(sender))
        {
            throw new HubException(
                "User is not authenticated."
            );
        }


        var message =
            new Message
            {
                Sender = sender,

                MessageText =
                    messageText.Trim(),

                SentAt =
                    DateTime.UtcNow
            };


        _db.Messages.Add(message);

        await _db.SaveChangesAsync();


        await Clients.All.SendAsync(
            "ReceiveMessage",
            message.Sender,
            message.MessageText,
            message.SentAt
        );
    }

    /* =========================
       SEND IMAGE
       ========================= */

    public async Task SendImage(
        string fileName,
        string originalFileName)
    {
        var sender =
            Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(sender))
        {
            throw new HubException(
                "User is not authenticated."
            );
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new HubException(
                "Invalid image."
            );
        }

        var safeFileName =
            Path.GetFileName(fileName);

        var uploadDirectory =
            Path.Combine(
                Directory.GetCurrentDirectory(),
                "ChatUploads"
            );

        var filePath =
            Path.Combine(
                uploadDirectory,
                safeFileName
            );

        if (!File.Exists(filePath))
        {
            throw new HubException(
                "Image file was not found."
            );
        }

        var extension =
            Path.GetExtension(safeFileName)
                .ToLowerInvariant();

        var allowedExtensions = new[]
        {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp"
        };

        if (!allowedExtensions.Contains(extension))
        {
            throw new HubException(
                "Invalid image type."
            );
        }

        var message =
            new Message
            {
                Sender = sender,

                MessageText = "",

                SentAt =
                    DateTime.UtcNow,

                MessageType = "image",

                FilePath =
                    fileName,

                OriginalFileName =
                    string.IsNullOrWhiteSpace(
                        originalFileName)
                        ? "image"
                        : Path.GetFileName(
                            originalFileName)
            };

        _db.Messages.Add(message);

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "ReceiveImage",
            message.Sender,
            message.FilePath,
            message.OriginalFileName,
            message.SentAt
        );
    }

    /* =========================
       START CALL
       ========================= */

public async Task CallUser(
    string targetUser,
    string callType,
    string roomName)
{
    var caller =
        Context.User?.Identity?.Name;

    if (string.IsNullOrEmpty(caller))
    {
        throw new HubException(
            "User is not authenticated."
        );
    }

    if (
        targetUser != "Tom" &&
        targetUser != "Myauuu"
    )
    {
        throw new HubException(
            "Invalid user."
        );
    }

    if (
        callType != "voice" &&
        callType != "video"
    )
    {
        throw new HubException(
            "Invalid call type."
        );
    }

    if (caller == targetUser)
    {
        throw new HubException(
            "You cannot call yourself."
        );
    }

    if (string.IsNullOrWhiteSpace(roomName))
    {
        throw new HubException(
            "Invalid room name."
        );
    }

    string? targetConnectionId;

    lock (UserLock)
    {
        ConnectedUsers.TryGetValue(
            targetUser,
            out targetConnectionId
        );
    }

    if (
        string.IsNullOrEmpty(
            targetConnectionId
        )
    )
    {
        throw new HubException(
            $"{targetUser} is offline."
        );
    }

    await Clients.Client(
        targetConnectionId
    ).SendAsync(
        "IncomingCall",
        caller,
        callType,
        roomName
    );
}

    /* =========================
       ACCEPT CALL
       ========================= */

public async Task AcceptCall(
    string callerUser,
    string callType,
    string roomName)
{
    var receiver =
        Context.User?.Identity?.Name;

    if (string.IsNullOrEmpty(receiver))
    {
        throw new HubException(
            "User is not authenticated."
        );
    }

    if (
        callerUser != "Tom" &&
        callerUser != "Myauuu"
    )
    {
        throw new HubException(
            "Invalid caller."
        );
    }

    if (
        callType != "voice" &&
        callType != "video"
    )
    {
        throw new HubException(
            "Invalid call type."
        );
    }

    if (string.IsNullOrWhiteSpace(roomName))
    {
        throw new HubException(
            "Invalid room name."
        );
    }

    string? callerConnectionId;

    lock (UserLock)
    {
        ConnectedUsers.TryGetValue(
            callerUser,
            out callerConnectionId
        );
    }

    if (
        string.IsNullOrEmpty(
            callerConnectionId
        )
    )
    {
        throw new HubException(
            "Caller is no longer online."
        );
    }

    await Clients.Client(
        callerConnectionId
    ).SendAsync(
        "CallAccepted",
        receiver,
        callType,
        roomName
    );
}

    /* =========================
       REJECT CALL
       ========================= */

    public async Task RejectCall(
        string callerUser)
    {
        var receiver =
            Context.User?.Identity?.Name;


        if (string.IsNullOrEmpty(receiver))
            return;


        string? callerConnectionId;


        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                callerUser,
                out callerConnectionId
            );
        }


        if (
            string.IsNullOrEmpty(
                callerConnectionId
            )
        )
        {
            return;
        }


        await Clients.Client(
            callerConnectionId
        ).SendAsync(
            "CallRejected",
            receiver
        );
    }


    /* =========================
       END CALL
       ========================= */

    public async Task EndCall(
        string otherUser)
    {
        var caller =
            Context.User?.Identity?.Name;


        if (string.IsNullOrEmpty(caller))
            return;


        string? otherConnectionId;


        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                otherUser,
                out otherConnectionId
            );
        }


        if (
            string.IsNullOrEmpty(
                otherConnectionId
            )
        )
        {
            return;
        }


        await Clients.Client(
            otherConnectionId
        ).SendAsync(
            "CallEnded",
            caller
        );
    }
}
