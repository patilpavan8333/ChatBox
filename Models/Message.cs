namespace PrivateChat.Models;

public class Message
{
    public int Id { get; set; }

    public string Sender { get; set; } = string.Empty;

    public string MessageText { get; set; } = string.Empty;

    public DateTime SentAt { get; set; }
}
