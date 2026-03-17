import { auth, signIn, signOut } from "@/lib/auth/config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CalendarDays } from "lucide-react";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="flex items-center justify-between px-4 h-14 border-b bg-background">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-primary" />
        <span className="font-semibold text-base">My Calendar</span>
      </div>

      {session?.user ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="size-9 cursor-pointer">
              <AvatarImage
                src={session.user.image ?? undefined}
                alt={session.user.name ?? "User"}
              />
              <AvatarFallback>
                {session.user.name?.charAt(0).toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-sm font-medium">
              {session.user.name}
            </div>
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {session.user.email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
                className="w-full"
              >
                <button type="submit" className="w-full text-left cursor-pointer">
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <Button type="submit" size="sm">
            Sign in with Google
          </Button>
        </form>
      )}
    </header>
  );
}
