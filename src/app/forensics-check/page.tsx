import { notFound } from "next/navigation";
import { ForensicsCheck } from "@/components/dev/ForensicsCheck";

/**
 * Development-only verification harness for the forensic engine.
 * Never reachable in a production build.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ForensicsCheck />;
}
