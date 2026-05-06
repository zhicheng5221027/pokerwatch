import { Link } from "react-router-dom";

export default function Sessions() {
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold">Sessions</h1>
      <p className="mt-2 text-muted-foreground">Past sessions land here.</p>
      <Link to="/" className="mt-6 inline-block text-primary hover:underline">← Back to overlay</Link>
    </div>
  );
}
