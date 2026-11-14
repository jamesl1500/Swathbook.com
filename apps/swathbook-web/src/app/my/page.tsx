import { redirect } from "next/navigation";
import { routes } from "@/libs/routes";

export default function CustomerHome() {
  redirect(routes.customerJobs);
}
