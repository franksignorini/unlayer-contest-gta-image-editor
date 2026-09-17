import { notFound } from "next/navigation";
import { ForensicsEditor } from "@/components/dev/ForensicsEditor";

/**
 * Editor-in-the-loop forensic bench. Development only, never reachable in a
 * production build — it mounts the editor purely to score what it produces.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ForensicsEditor />;
}
