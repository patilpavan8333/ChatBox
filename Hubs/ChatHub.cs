using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
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

    private static readonly string[] AllowedUsers =
    {
        "Tom",
        "Myauuu"
    };

    private static readonly string[] AllowedReactions =
    {
        "❤️",
        "😂",
        "😮",
        "😢",
        "😡",
        "👍"
    };

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

        var becameOnline =
            _presence.UserConnected(userName);

        await Clients.Caller.SendAsync(
            "CurrentUserStatuses",
            new
            {
                Tom =
                    _presence.IsOnline("Tom"),

                Myauuu =
                    _presence.IsOnline("Myauuu")
            });

        if (becameOnline)
        {
            await Clients.All.SendAsync(
                "UserStatusChanged",
                userName,
                true);
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
        var userName = Context.User?.Identity?.Name;

        if (!string.IsNullOrEmpty(userName))
        {
            lock (UserLock)
            {
                if (
                    ConnectedUsers.TryGetValue(
                        userName,
                        out var connectionId)
                    &&
                    connectionId == Context.ConnectionId)
                {
                    ConnectedUsers.Remove(userName);
                }
            }

            var becameOffline =
                _presence.UserDisconnected(userName);

            if (becameOffline)
            {
                await Clients.All.SendAsync(
                    "UserStatusChanged",
                    userName,
                    false);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    /* =========================
       SEND MESSAGE
       ========================= */

    public async Task SendMessage(string messageText)
    {
        await CreateAndBroadcastMessage(
            messageText,
            null);
    }

    /* =========================
       SEND REPLY
       ========================= */

    public async Task SendReply(
        string messageText,
        int replyToMessageId)
    {
        await CreateAndBroadcastMessage(
            messageText,
            replyToMessageId);
    }

    private async Task CreateAndBroadcastMessage(
        string messageText,
        int? replyToMessageId)
    {
        if (string.IsNullOrWhiteSpace(messageText))
            return;

        if (messageText.Length > 2000)
        {
            throw new HubException(
                "Message is too long.");
        }

        var sender = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(sender))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        Message? replyTo = null;

        if (replyToMessageId.HasValue)
        {
            replyTo = await _db.Messages
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    m => m.Id == replyToMessageId.Value);

            if (replyTo == null)
            {
                throw new HubException(
                    "Reply message was not found.");
            }
        }

        var message = new Message
        {
            Sender = sender,
            MessageText = messageText.Trim(),

            // This timestamp is created ONCE.
            // Editing never changes it.
            SentAt = DateTime.UtcNow,

            MessageType = "text",

            ReplyToMessageId =
                replyToMessageId
        };

        _db.Messages.Add(message);

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "ReceiveMessage",
            new
            {
                id = message.Id,
                sender = message.Sender,
                messageText = message.MessageText,
                sentAt = message.SentAt,
                messageType = message.MessageType,
                replyToMessageId = message.ReplyToMessageId,
                replySender = replyTo?.Sender,
                replyText = replyTo == null
                    ? null
                    : GetReplyPreview(replyTo),
                editedAt = message.EditedAt,
                isDeleted = message.IsDeleted,
                deliveredAt = message.DeliveredAt,
                seenAt = message.SeenAt
            });
    }

    private static string GetReplyPreview(Message message)
    {
        if (message.IsDeleted)
            return "This message was deleted";

        if (message.MessageType == "image")
            return "📷 Photo";

        if (string.IsNullOrWhiteSpace(message.MessageText))
            return "Message";

        return message.MessageText.Length > 100
            ? message.MessageText[..100] + "..."
            : message.MessageText;
    }

    /* =========================
       SEND IMAGE
       ========================= */

    public async Task SendImage(
        string fileName,
        string originalFileName)
    {
        var sender = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(sender))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new HubException(
                "Invalid image.");
        }

        var safeFileName = Path.GetFileName(fileName);

        var uploadDirectory = Path.Combine(
            Directory.GetCurrentDirectory(),
            "ChatUploads");

        var filePath = Path.Combine(
            uploadDirectory,
            safeFileName);

        if (!File.Exists(filePath))
        {
            throw new HubException(
                "Image file was not found.");
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
                "Invalid image type.");
        }

        var message = new Message
        {
            Sender = sender,

            MessageText = "",

            SentAt = DateTime.UtcNow,

            MessageType = "image",

            FilePath = fileName,

            OriginalFileName =
                string.IsNullOrWhiteSpace(originalFileName)
                    ? "image"
                    : Path.GetFileName(originalFileName)
        };

        _db.Messages.Add(message);

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "ReceiveImage",
            new
            {
                id = message.Id,
                sender = message.Sender,
                filePath = message.FilePath,
                originalFileName = message.OriginalFileName,
                sentAt = message.SentAt,
                messageType = message.MessageType,
                editedAt = message.EditedAt,
                isDeleted = message.IsDeleted,
                deliveredAt = message.DeliveredAt,
                seenAt = message.SeenAt
            });
    }

    /* =========================
       EDIT MESSAGE
       ========================= */

    public async Task EditMessage(
        int messageId,
        string newText)
    {
        var userName = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(userName))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (string.IsNullOrWhiteSpace(newText))
        {
            throw new HubException(
                "Message cannot be empty.");
        }

        if (newText.Length > 2000)
        {
            throw new HubException(
                "Message is too long.");
        }

        var message = await _db.Messages
            .FirstOrDefaultAsync(m => m.Id == messageId);

        if (message == null)
        {
            throw new HubException(
                "Message not found.");
        }

        if (message.Sender != userName)
        {
            throw new HubException(
                "You can only edit your own messages.");
        }

        if (message.IsDeleted)
        {
            throw new HubException(
                "Deleted messages cannot be edited.");
        }

        if (message.MessageType != "text")
        {
            throw new HubException(
                "Only text messages can be edited.");
        }

        // Server-side 5 minute restriction.
        if (DateTime.UtcNow - message.SentAt >
            TimeSpan.FromMinutes(5))
        {
            throw new HubException(
                "Messages can only be edited within 5 minutes.");
        }

        message.MessageText = newText.Trim();

        // IMPORTANT:
        // SentAt is NOT changed.
        message.EditedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "MessageEdited",
            new
            {
                id = message.Id,
                messageText = message.MessageText,
                editedAt = message.EditedAt
            });
    }

    /* =========================
       DELETE MESSAGES
       ========================= */

    public async Task DeleteMessages(
        int[] messageIds)
    {
        var userName = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(userName))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (messageIds == null ||
            messageIds.Length == 0)
        {
            return;
        }

        var ids = messageIds
            .Distinct()
            .Take(100)
            .ToArray();

        var messages = await _db.Messages
            .Where(m =>
                ids.Contains(m.Id) &&
                m.Sender == userName &&
                !m.IsDeleted)
            .ToListAsync();

        if (messages.Count == 0)
            return;

        var deletedAt = DateTime.UtcNow;

        foreach (var message in messages)
        {
            // Soft delete.
            // We keep the database row so replies and
            // reactions don't break.
            message.IsDeleted = true;
            message.DeletedAt = deletedAt;

            message.MessageText = "";
        }

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "MessagesDeleted",
            messages.Select(m => new
            {
                id = m.Id,
                deletedAt
            }).ToArray());
    }

    /* =========================
       REACTION
       ========================= */

    public async Task ReactToMessage(
        int messageId,
        string emoji)
    {
        var userName = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(userName))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (!AllowedReactions.Contains(emoji))
        {
            throw new HubException(
                "Invalid reaction.");
        }

        var messageExists = await _db.Messages
            .AnyAsync(m => m.Id == messageId);

        if (!messageExists)
        {
            throw new HubException(
                "Message not found.");
        }

        var existingReaction =
            await _db.MessageReactions
                .FirstOrDefaultAsync(r =>
                    r.MessageId == messageId &&
                    r.User == userName);

        if (existingReaction != null)
        {
            // Tapping the same reaction again removes it.
            if (existingReaction.Emoji == emoji)
            {
                _db.MessageReactions.Remove(
                    existingReaction);

                await _db.SaveChangesAsync();

                await Clients.All.SendAsync(
                    "ReactionChanged",
                    messageId,
                    userName,
                    null);

                return;
            }

            // Change reaction.
            existingReaction.Emoji = emoji;
            existingReaction.CreatedAt =
                DateTime.UtcNow;
        }
        else
        {
            var reaction = new MessageReaction
            {
                MessageId = messageId,
                User = userName,
                Emoji = emoji,
                CreatedAt = DateTime.UtcNow
            };

            _db.MessageReactions.Add(reaction);
        }

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "ReactionChanged",
            messageId,
            userName,
            emoji);
    }

    /* =========================
       DELIVERED
       ========================= */

    public async Task MarkMessagesDelivered(
        int[] messageIds)
    {
        var userName = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(userName))
            return;

        if (messageIds == null ||
            messageIds.Length == 0)
            return;

        var ids = messageIds
            .Distinct()
            .Take(200)
            .ToArray();

        var messages = await _db.Messages
            .Where(m =>
                ids.Contains(m.Id) &&
                m.Sender != userName &&
                m.DeliveredAt == null)
            .ToListAsync();

        if (messages.Count == 0)
            return;

        var deliveredAt = DateTime.UtcNow;

        foreach (var message in messages)
        {
            message.DeliveredAt = deliveredAt;
        }

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "MessageStatusUpdated",
            messages.Select(m => new
            {
                id = m.Id,
                deliveredAt = m.DeliveredAt,
                seenAt = m.SeenAt
            }).ToArray());
    }

    /* =========================
       SEEN
       ========================= */

    public async Task MarkMessagesSeen(
        int[] messageIds)
    {
        var userName = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(userName))
            return;

        if (messageIds == null ||
            messageIds.Length == 0)
            return;

        var ids = messageIds
            .Distinct()
            .Take(200)
            .ToArray();

        var messages = await _db.Messages
            .Where(m =>
                ids.Contains(m.Id) &&
                m.Sender != userName &&
                m.SeenAt == null)
            .ToListAsync();

        if (messages.Count == 0)
            return;

        var seenAt = DateTime.UtcNow;

        foreach (var message in messages)
        {
            message.SeenAt = seenAt;

            if (message.DeliveredAt == null)
            {
                message.DeliveredAt = seenAt;
            }
        }

        await _db.SaveChangesAsync();

        await Clients.All.SendAsync(
            "MessageStatusUpdated",
            messages.Select(m => new
            {
                id = m.Id,
                deliveredAt = m.DeliveredAt,
                seenAt = m.SeenAt
            }).ToArray());
    }

    /* =========================
       START CALL
       ========================= */

    public async Task CallUser(
        string targetUser,
        string callType,
        string roomName)
    {
        var caller = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(caller))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (!AllowedUsers.Contains(targetUser))
        {
            throw new HubException(
                "Invalid user.");
        }

        if (callType != "voice" &&
            callType != "video")
        {
            throw new HubException(
                "Invalid call type.");
        }

        if (caller == targetUser)
        {
            throw new HubException(
                "You cannot call yourself.");
        }

        if (string.IsNullOrWhiteSpace(roomName))
        {
            throw new HubException(
                "Invalid room name.");
        }

        string? targetConnectionId;

        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                targetUser,
                out targetConnectionId);
        }

        if (string.IsNullOrEmpty(targetConnectionId))
        {
            throw new HubException(
                $"{targetUser} is offline.");
        }

        await Clients.Client(
            targetConnectionId)
            .SendAsync(
                "IncomingCall",
                caller,
                callType,
                roomName);
    }

    /* =========================
       ACCEPT CALL
       ========================= */

    public async Task AcceptCall(
        string callerUser,
        string callType,
        string roomName)
    {
        var receiver = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(receiver))
        {
            throw new HubException(
                "User is not authenticated.");
        }

        if (!AllowedUsers.Contains(callerUser))
        {
            throw new HubException(
                "Invalid caller.");
        }

        if (callType != "voice" &&
            callType != "video")
        {
            throw new HubException(
                "Invalid call type.");
        }

        if (string.IsNullOrWhiteSpace(roomName))
        {
            throw new HubException(
                "Invalid room name.");
        }

        string? callerConnectionId;

        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                callerUser,
                out callerConnectionId);
        }

        if (string.IsNullOrEmpty(callerConnectionId))
        {
            throw new HubException(
                "Caller is no longer online.");
        }

        await Clients.Client(
            callerConnectionId)
            .SendAsync(
                "CallAccepted",
                receiver,
                callType,
                roomName);
    }

    /* =========================
       REJECT CALL
       ========================= */

    public async Task RejectCall(
        string callerUser)
    {
        var receiver = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(receiver))
            return;

        string? callerConnectionId;

        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                callerUser,
                out callerConnectionId);
        }

        if (string.IsNullOrEmpty(callerConnectionId))
            return;

        await Clients.Client(
            callerConnectionId)
            .SendAsync(
                "CallRejected",
                receiver);
    }

    /* =========================
       END CALL
       ========================= */

    public async Task EndCall(
        string otherUser)
    {
        var caller = Context.User?.Identity?.Name;

        if (string.IsNullOrEmpty(caller))
            return;

        string? otherConnectionId;

        lock (UserLock)
        {
            ConnectedUsers.TryGetValue(
                otherUser,
                out otherConnectionId);
        }

        if (string.IsNullOrEmpty(otherConnectionId))
            return;

        await Clients.Client(
            otherConnectionId)
            .SendAsync(
                "CallEnded",
                caller);
    }
}
