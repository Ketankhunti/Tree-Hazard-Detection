import { redirect } from "next/navigation";

export default function ReportPage() {
  // The form moved to the root. Kept so links printed on earlier notices, and
  // /report/<reference> confirmations shared by residents, do not dead-end.
  redirect("/");
}
