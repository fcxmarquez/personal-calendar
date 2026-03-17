import { auth } from "@/lib/auth/config";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/config";
import { CalendarDays } from "lucide-react";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <CalendarDays className="size-16 text-primary" />
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">My Calendar</h1>
          <p className="text-muted-foreground">
            Sign in with Google to access your personal calendar
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <Button type="submit" size="lg">
            Sign in with Google
          </Button>
        </form>
      </div>
    );
  }

  return <CalendarView />;
}
