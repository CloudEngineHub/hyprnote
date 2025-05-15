import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/daily/today")({
  beforeLoad: async () => {
    const today = new Date().toISOString().split("T")[0];
    return redirect({ to: "/app/daily/$date", params: { date: today } });
  },
});
