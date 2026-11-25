export function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/u);
  const initials = words.length === 1
    ? Array.from(words[0]).slice(0, 2).join("")
    : (Array.from(words[0])[0] ?? "") + (Array.from(words[words.length - 1])[0] ?? "");
  return (initials || "KH").toLocaleUpperCase("vi");
}
