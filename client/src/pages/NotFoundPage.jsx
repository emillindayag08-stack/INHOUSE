import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100 text-center">
      <p className="text-4xl font-medium text-maroon">404</p>
      <p className="text-sm text-neutral-500">This page doesn't exist.</p>
      <Link to="/" className="text-sm font-medium text-maroon hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
