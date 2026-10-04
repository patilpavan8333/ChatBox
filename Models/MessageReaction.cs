namespace PrivateChat.Models;

public class MessageReaction
{
    public int Id { get; set; }

    public int MessageId { get; set; }

    public string User { get; set; } = string.Empty;

    public string Emoji { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public Message Message { get; set; } = null!;
}
