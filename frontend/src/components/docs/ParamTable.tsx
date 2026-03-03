interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  default?: string;
}

interface ParamTableProps {
  title: string;
  params: Param[];
}

export default function ParamTable({ title, params }: ParamTableProps) {
  return (
    <div className="my-6">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        {title}
      </h4>
      <div className="bg-slate-50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Parameter</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((param, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <code className="text-blue-600 font-mono text-sm">{param.name}</code>
                  {param.required && (
                    <span className="ml-2 text-xs text-red-500 font-medium">required</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-600 font-mono text-sm">{param.type}</span>
                  {param.default && (
                    <span className="ml-2 text-xs text-slate-400">default: {param.default}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{param.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
