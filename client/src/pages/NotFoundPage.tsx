import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-4xl font-bold text-slate-200">404</p>
      <p className="text-sm text-slate-500">Page not found</p>
      <Link to="/entries" className="text-sm text-blue-600 hover:underline">
        Go to Cash Book
      </Link>
    </div>
  );
}
