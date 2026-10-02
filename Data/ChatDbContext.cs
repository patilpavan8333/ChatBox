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
}
