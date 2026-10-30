import { notFound } from "next/navigation";

// Reserved for the owner and appointed admins. Keep closed until trusted
// server-side authentication and authorization are implemented and reviewed.
export default function Headquarters() {
  notFound();
}
