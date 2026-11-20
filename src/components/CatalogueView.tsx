import { useState } from 'react';
import { Archive, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ErpState, Product, Service } from '../types/erp';
import { formatMoney } from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface CatalogueViewProps {
  state: ErpState;
  onAddProduct: (name: string, type: string) => void;
  onUpdateProduct: (id: string, patch: Partial<Product>) => void;
  onDeleteProduct?: (id: string) => void;
  onAddService: (name: string) => void;
  onUpdateService: (id: string, patch: Partial<Service>) => void;
  onDeleteService?: (id: string) => void;
  onUpsertPrice: (productId: string, serviceId: string, price: number) => void;
  onDeletePrice?: (productId: string, serviceId: string) => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function CatalogueView({
  state,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddService,
  onUpdateService,
  onDeleteService,
  onUpsertPrice,
  onDeletePrice,
  onRequestDelete,
}: CatalogueViewProps) {
  const sym = state.settings.currencySymbol;
  const [newProdName, setNewProdName] = useState('');
  const [newProdType, setNewProdType] = useState('Apparel');
  const [newServiceName, setNewServiceName] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    kind: 'productName' | 'productType' | 'serviceName' | 'price';
    id: string;
    secondaryId?: string;
    value: string;
  } | null>(null);

  const visibleProducts = showInactive ? state.products : state.products.filter((p) => p.active);
  const visibleServices = showInactive ? state.services : state.services.filter((s) => s.active);

  const commitEdit = () => {
    if (!editingCell) return;
    const trimmed = editingCell.value.trim();
    if (editingCell.kind === 'productName' && trimmed) {
      onUpdateProduct(editingCell.id, { name: trimmed });
    } else if (editingCell.kind === 'productType' && trimmed) {
      onUpdateProduct(editingCell.id, { type: trimmed });
    } else if (editingCell.kind === 'serviceName' && trimmed) {
      onUpdateService(editingCell.id, { name: trimmed });
    } else if (editingCell.kind === 'price' && editingCell.secondaryId) {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        onUpsertPrice(editingCell.id, editingCell.secondaryId, parsed);
      }
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Retail Product &amp; Service Catalogue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Piece-based retail items and customizable services · Click any cell to edit on the spot (Enter to save, Esc to cancel)
          </p>
        </div>

        <button
          onClick={() => setShowInactive((v) => !v)}
          className="px-3.5 py-2 text-xs font-medium rounded-xl bg-white/80 border border-slate-200 text-slate-700 hover:bg-white transition-colors self-start sm:self-auto"
        >
          {showInactive ? 'Hide Deactivated' : 'Show Deactivated'}
        </button>
      </div>

      {/* Quick Add Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newProdName.trim()) return;
            onAddProduct(newProdName.trim(), newProdType.trim() || 'Apparel');
            setNewProdName('');
          }}
          className="liquid-glass rounded-2xl p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">New Retail Product</label>
            <input
              type="text"
              value={newProdName}
              onChange={(e) => setNewProdName(e.target.value)}
              placeholder="e.g., Blazer, Duvet, Saree"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white/90 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <div className="w-36">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Type / Category</label>
            <input
              type="text"
              value={newProdType}
              onChange={(e) => setNewProdType(e.target.value)}
              placeholder="Apparel"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white/90 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newServiceName.trim()) return;
            onAddService(newServiceName.trim());
            setNewServiceName('');
          }}
          className="liquid-glass rounded-2xl p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              New Service (applies across matrix)
            </label>
            <input
              type="text"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              placeholder="e.g., Steam Press, Starch Finish"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white/90 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Service
          </button>
        </form>
      </div>

      {/* On-the-spot Editable Product + Service Price Matrix */}
      <div className="liquid-glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/70 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Product × Service Price Matrix</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every change logs before/after snapshots to Black Box and preserves historical invoices
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {visibleProducts.length} products · {visibleServices.length} services
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse erp-table">
            <thead>
              <tr className="border-b border-slate-200/80 text-xs font-semibold">
                <th className="py-3 px-4 min-w-[160px]">Product</th>
                <th className="py-3 px-4 min-w-[130px]">Type</th>
                {visibleServices.map((srv) => {
                  const isEditingSrv = editingCell?.kind === 'serviceName' && editingCell.id === srv.id;
                  const usedSrvOrders = state.orders.filter((o) =>
                    o.lines.some((l) => l.serviceId === srv.id)
                  ).length;
                  return (
                    <th key={srv.id} className="py-3 px-4 min-w-[130px] text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isEditingSrv ? (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            className="w-28 px-2 py-1 text-xs text-right rounded bg-white border border-[#0071E3] focus:outline-none text-slate-900"
                          />
                        ) : (
                          <button
                            onClick={() =>
                              setEditingCell({ kind: 'serviceName', id: srv.id, value: srv.name })
                            }
                            className={`hover:text-[#0071E3] transition-colors ${
                              !srv.active ? 'line-through text-slate-400' : ''
                            }`}
                            title="Click to rename service inline"
                          >
                            {srv.name}
                          </button>
                        )}
                        <button
                          onClick={() => onUpdateService(srv.id, { active: !srv.active })}
                          className="text-slate-400 hover:text-slate-700"
                          title={srv.active ? 'Deactivate service' : 'Reactivate service'}
                        >
                          {srv.active ? <Archive className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                        </button>
                        {onRequestDelete && onDeleteService && (
                          <button
                            type="button"
                            onClick={() =>
                              onRequestDelete({
                                itemType: 'Retail Service',
                                itemNameOrId: srv.name,
                                bodyText:
                                  usedSrvOrders > 0
                                    ? `Service "${srv.name}" is linked to ${usedSrvOrders} existing order(s). Deactivating hides it from new orders without breaking history.`
                                    : `Delete retail service "${srv.name}" and its price column?`,
                                linkedInfo:
                                  usedSrvOrders > 0
                                    ? `Used in ${usedSrvOrders} order(s). Deactivating is recommended instead of deleting.`
                                    : undefined,
                                alternativeLabel: srv.active ? 'Deactivate Instead' : undefined,
                                onAlternative: srv.active
                                  ? () => onUpdateService(srv.id, { active: false })
                                  : undefined,
                                onConfirmDelete:
                                  usedSrvOrders === 0 ? () => onDeleteService(srv.id) : undefined,
                              })
                            }
                            className="text-slate-400 hover:text-red-600"
                            title={`Delete ${srv.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="py-3 px-4 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-xs">
              {visibleProducts.map((prod) => {
                const editingProdName =
                  editingCell?.kind === 'productName' && editingCell.id === prod.id;
                const editingProdType =
                  editingCell?.kind === 'productType' && editingCell.id === prod.id;

                return (
                  <tr
                    key={prod.id}
                    className={`hover:bg-white/60 transition-colors ${
                      !prod.active ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {editingProdName ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full px-2 py-1 text-xs rounded bg-white border border-[#0071E3] focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            setEditingCell({ kind: 'productName', id: prod.id, value: prod.name })
                          }
                          className="text-left hover:text-[#0071E3] transition-colors w-full"
                          title="Click to edit product name"
                        >
                          {prod.name}
                        </button>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-slate-600">
                      {editingProdType ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full px-2 py-1 text-xs rounded bg-white border border-[#0071E3] focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            setEditingCell({ kind: 'productType', id: prod.id, value: prod.type })
                          }
                          className="text-left hover:text-[#0071E3] transition-colors w-full"
                          title="Click to edit product type"
                        >
                          {prod.type}
                        </button>
                      )}
                    </td>

                    {visibleServices.map((srv) => {
                      const entry = state.prices.find(
                        (p) => p.productId === prod.id && p.serviceId === srv.id
                      );
                      const isEditingPrice =
                        editingCell?.kind === 'price' &&
                        editingCell.id === prod.id &&
                        editingCell.secondaryId === srv.id;

                      return (
                        <td key={srv.id} className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {isEditingPrice ? (
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              step="0.5"
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell, value: e.target.value })
                              }
                              onBlur={commitEdit}
                              onKeyDown={handleKeyDown}
                              className="w-24 px-2 py-1 text-xs text-right rounded bg-white border border-[#0071E3] focus:outline-none"
                            />
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1 w-full">
                              <button
                                onClick={() =>
                                  setEditingCell({
                                    kind: 'price',
                                    id: prod.id,
                                    secondaryId: srv.id,
                                    value: entry ? String(entry.price) : '',
                                  })
                                }
                                className={`text-right py-1 px-1.5 rounded hover:bg-[#0071E3]/10 transition-colors ${
                                  entry ? 'text-slate-900 font-medium' : 'text-slate-400'
                                }`}
                                title="Click to set or update price inline"
                              >
                                {entry ? formatMoney(entry.price, sym) : 'Set price'}
                              </button>
                              {entry && onRequestDelete && onDeletePrice && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRequestDelete({
                                      itemType: 'Matrix Price',
                                      itemNameOrId: `${prod.name} · ${srv.name} (${formatMoney(entry.price, sym)})`,
                                      bodyText: `Clear the retail rate for "${prod.name} · ${srv.name}"? Orders created without a price will trigger a zero-price warning.`,
                                      onConfirmDelete: () => onDeletePrice(prod.id, srv.id),
                                    })
                                  }
                                  className="p-0.5 text-slate-300 hover:text-red-600"
                                  title="Clear price"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          onClick={() => onUpdateProduct(prod.id, { active: !prod.active })}
                          className="text-xs font-medium text-slate-500 hover:text-[#0071E3] whitespace-nowrap"
                        >
                          {prod.active ? 'Deactivate' : 'Restore'}
                        </button>
                        {onRequestDelete && onDeleteProduct && (
                          <button
                            type="button"
                            onClick={() => {
                              const usedProdOrders = state.orders.filter((o) =>
                                o.lines.some((l) => l.productId === prod.id)
                              ).length;
                              onRequestDelete({
                                itemType: 'Retail Product',
                                itemNameOrId: prod.name,
                                bodyText:
                                  usedProdOrders > 0
                                    ? `Product "${prod.name}" is used in ${usedProdOrders} retail order(s). Deactivating keeps historical orders intact.`
                                    : `Delete retail product "${prod.name}" and its price entries?`,
                                linkedInfo:
                                  usedProdOrders > 0
                                    ? `Linked to ${usedProdOrders} existing retail order(s). Deactivating is preferred.`
                                    : undefined,
                                alternativeLabel: prod.active ? 'Deactivate Instead' : undefined,
                                onAlternative: prod.active
                                  ? () => onUpdateProduct(prod.id, { active: false })
                                  : undefined,
                                onConfirmDelete:
                                  usedProdOrders === 0 ? () => onDeleteProduct(prod.id) : undefined,
                              });
                            }}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title={`Delete ${prod.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
