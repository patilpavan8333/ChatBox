namespace PrivateChat.Models;

public class Message
{
    public int Id { get; set; }

    public string Sender { get; set; } = string.Empty;

    public string MessageText { get; set; } = string.Empty;

    // Original send time. Never change this when editing.
    public DateTime SentAt { get; set; }

    public string MessageType { get; set; } = "text";

    public string? FilePath { get; set; }

    public string? OriginalFileName { get; set; }

    // Edit
    public DateTime? EditedAt { get; set; }

    // Reply
    public int? ReplyToMessageId { get; set; }

    public Message? ReplyToMessage { get; set; }

    // Delete
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    // Delivery / Seen
    public DateTime? DeliveredAt { get; set; }

    public DateTime? SeenAt { get; set; }

    // Reactions
    public ICollection<MessageReaction> Reactions { get; set; }
        = new List<MessageReaction>();
}
