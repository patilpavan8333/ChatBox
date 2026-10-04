using Microsoft.EntityFrameworkCore;
using PrivateChat.Models;

namespace PrivateChat.Data;

public class ChatDbContext : DbContext
{
    public ChatDbContext(DbContextOptions<ChatDbContext> options)
        : base(options)
    {
    }

    public DbSet<Message> Messages => Set<Message>();

    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Message -> Reply relationship
        modelBuilder.Entity<Message>()
            .HasOne(m => m.ReplyToMessage)
            .WithMany()
            .HasForeignKey(m => m.ReplyToMessageId)
            .OnDelete(DeleteBehavior.Restrict);

        // One reaction per user per message
        modelBuilder.Entity<MessageReaction>()
            .HasIndex(r => new { r.MessageId, r.User })
            .IsUnique();

        // Message -> Reactions
        modelBuilder.Entity<MessageReaction>()
            .HasOne(r => r.Message)
            .WithMany(m => m.Reactions)
            .HasForeignKey(r => r.MessageId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
