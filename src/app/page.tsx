import { redirect } from "next/navigation";

export default function Home() {
  // The public submission form arrives with the intake task; until then the
  // admin console is the only surface.
  redirect("/admin");
}
