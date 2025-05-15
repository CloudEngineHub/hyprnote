import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/daily/$date")({
  beforeLoad: async () => {
    const today = new Date().toISOString().split("T")[0];
    // TODO: redirect to session
    return redirect({ to: "/app/daily/$date", params: { date: today } });
  },
});
