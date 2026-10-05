// A user's profile picture, or their initial when they have none. Size and
// shape come from className.
export function Avatar({
  user,
  className = "",
}: {
  user: { username: string; photoKey: string | null };
  className?: string;
}) {
  if (user.photoKey) {
    return (
      <img
        src={`https://media.oder.locker/avatars/${user.photoKey}`}
        alt=""
        className={`rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center rounded-full bg-secondary font-antonio text-white uppercase ${className}`}
    >
      {user.username[0]}
    </span>
  );
}
