import { Link, useParams } from "react-router-dom";

export default function SessionDetail() {
  const { id } = useParams();
  return (
    <div className="container py-10">
      <Link to="/sessions" className="text-sm text-muted-foreground hover:underline">← All sessions</Link>
      <h1 className="mt-2 text-2xl font-semibold">Session {id?.slice(0, 8)}</h1>
      <p className="mt-2 text-muted-foreground">Hand-by-hand review goes here.</p>
    </div>
  );
}
