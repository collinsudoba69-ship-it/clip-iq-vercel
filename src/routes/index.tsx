import { createFileRoute } from "@tanstack/react-router";
import { ClipboardDashboard } from "@/components/ClipboardDashboard";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <ClipboardDashboard />;
}
