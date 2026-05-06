import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center space-y-2">
        <p className="text-2xl font-semibold">Off the felt.</p>
        <p className="text-muted-foreground">That page doesn't exist.</p>
        <Link className="text-primary underline-offset-4 hover:underline" to="/">
          Back to overlay
        </Link>
      </div>
    </div>
  );
}
