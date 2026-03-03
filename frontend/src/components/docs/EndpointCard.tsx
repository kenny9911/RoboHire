interface EndpointCardProps {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
}

const methodColors = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-purple-100 text-purple-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function EndpointCard({ method, path, description }: EndpointCardProps) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${methodColors[method]}`}>
          {method}
        </span>
        <code className="text-sm font-mono text-slate-800">{path}</code>
      </div>
      {description && (
        <p className="text-slate-600 text-sm ml-[70px]">{description}</p>
      )}
    </div>
  );
}
