using System.Collections.Concurrent;

namespace PrivateChat.Services;

public class PresenceService
{
    private readonly ConcurrentDictionary<string, int> _users = new();

    public bool UserConnected(string userName)
    {
        var count = _users.AddOrUpdate(
            userName,
            1,
            (_, current) => current + 1
        );

        return count == 1;
    }

    public bool UserDisconnected(string userName)
    {
        if (!_users.TryGetValue(userName, out var count))
            return false;

        if (count <= 1)
        {
            _users.TryRemove(userName, out _);
            return true;
        }

        _users[userName] = count - 1;

        return false;
    }

    public bool IsOnline(string userName)
    {
        return _users.ContainsKey(userName);
    }
}
