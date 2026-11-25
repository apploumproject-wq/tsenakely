import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  CheckCircle2,
  FileText,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import {InvoicePdfModal} from '../components/InvoicePdfModal';
import {ThermalReceiptModal} from '../components/ThermalReceiptModal';
import {tsenakelyDb} from '../db/database';
import type {
  AppSettings,
  CartItem,
  Product,
  SaleWithDetails,
  User,
} from '../db/types';
import {formatAriary, formatDateTime, formatNumber} from '../utils/format';
import {thermalPrinter} from '../utils/thermalPrinter';

interface PosPageProps {
  currentUser: User;
  settings: AppSettings;
  refreshKey: number;
  onSaleCompleted: () => void;
}

export const PosPage: React.FC<PosPageProps> = ({
  currentUser,
  settings,
  refreshKey,
  onSaleCompleted,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Toutes');
  const [productPage, setProductPage] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [amountPaidText, setAmountPaidText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completedSale, setCompletedSale] = useState<SaleWithDetails | null>(
    null
  );
  const [autoPrintMessage, setAutoPrintMessage] = useState('');
  const [pdfPreviewSale, setPdfPreviewSale] = useState<SaleWithDetails | null>(
    null
  );
  const [thermalPreviewSale, setThermalPreviewSale] =
    useState<SaleWithDetails | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const currency = settings.currency || 'Ar';

  const loadProducts = useCallback(async () => {
    const [list, categories] = await Promise.all([
      tsenakelyDb.getProducts(),
      tsenakelyDb.getProductCategories(),
    ]);
    setProducts(list);
    setProductCategories(categories);
    // Synchroniser les produits du panier avec les stocks/prix actuels
    setCart((prev) =>
      prev
        .map((item) => {
          const fresh = list.find((p) => p.id === item.product.id);
          if (!fresh || (fresh.product_type !== 'HOMEMADE' && fresh.stock_qty <= 0)) return null;
          return {
            product: fresh,
            quantity: fresh.product_type === 'HOMEMADE' ? item.quantity : Math.min(item.quantity, fresh.stock_qty),
          };
        })
        .filter((x): x is CartItem => x !== null)
    );
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, refreshKey]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !q || product.name.toLowerCase().includes(q);
      const matchesCategory =
        categoryFilter === 'Toutes' ||
        (product.category || 'Autres') === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);
  useEffect(() => { setProductPage(0); }, [search, categoryFilter]);

  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice(productPage * pageSize, (productPage + 1) * pageSize);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Math.round(item.product.price * item.quantity),
        0
      ),
    [cart]
  );

  const totalItemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const numericAmountPaid = useMemo(() => {
    const cleaned = amountPaidText.replace(/\s+/g, '');
    if (!cleaned) return 0;
    const val = Number(cleaned);
    return Number.isFinite(val) && val >= 0 ? Math.round(val) : 0;
  }, [amountPaidText]);

  const changeAmount = numericAmountPaid - cartTotal;

  const getCartQuantity = (productId: number) =>
    cart.find((c) => c.product.id === productId)?.quantity ?? 0;

  const addToCart = (product: Product) => {
    setError('');
    if (product.product_type !== 'HOMEMADE' && product.stock_qty <= 0) {
      setError(`« ${product.name} » est en rupture de stock.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const currentQty = prev[idx].quantity;
        if (product.product_type !== 'HOMEMADE' && currentQty >= product.stock_qty) {
          setError(
            `Stock maximum atteint pour « ${product.name} » (${product.stock_qty} disponible${
              product.stock_qty > 1 ? 's' : ''
            }).`
          );
          return prev;
        }
        const next = [...prev];
        next[idx] = {product, quantity: currentQty + 1};
        return next;
      }
      return [...prev, {product, quantity: 1}];
    });
  };

  const updateCartQuantity = (productId: number, nextQty: number) => {
    setError('');
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (item.product.product_type !== 'HOMEMADE' && nextQty > item.product.stock_qty) {
          setError(
            `Stock disponible insuffisant pour « ${item.product.name} » (max ${item.product.stock_qty}).`
          );
          return {...item, quantity: item.product.stock_qty};
        }
        return {...item, quantity: nextQty};
      })
    );
  };

  const removeFromCart = (productId: number) => {
    setError('');
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clearCart = () => {
    setError('');
    setCart([]);
    setAmountPaidText('');
  };

  const handleValidateSale = async () => {
    if (submitting) return;
    setError('');

    if (cart.length === 0) {
      setError('Ajoutez au moins un produit dans le panier.');
      return;
    }
    if (numericAmountPaid < cartTotal) {
      setError(
        `Le montant payé (${formatAriary(
          numericAmountPaid,
          currency
        )}) est inférieur au total (${formatAriary(cartTotal, currency)}).`
      );
      return;
    }

    setSubmitting(true);
    setAutoPrintMessage('');
    try {
      const created = await tsenakelyDb.createSale(
        currentUser,
        cart,
        numericAmountPaid,
        {name: customerName, phone: customerPhone, email: customerEmail, address: customerAddress}
      );
      setCart([]);
      setAmountPaidText('');
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerAddress('');
      setMobileCartOpen(false);
      setCompletedSale(created);
      await loadProducts();
      onSaleCompleted();

      if (settings.printer_auto_print_sale) {
        try {
          await thermalPrinter.printSaleReceipt(created, settings);
          setAutoPrintMessage('Ticket thermique imprimé automatiquement.');
        } catch (printErr) {
          setAutoPrintMessage(
            printErr instanceof Error
              ? `Vente enregistrée. Impression auto non effectuée : ${printErr.message}`
              : 'Vente enregistrée, mais imprimante thermique déconnectée.'
          );
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de valider la vente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const quickAmounts = [2000, 5000, 10000, 20000, 50000];

  const renderCartPanel = () => (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="w-5 h-5 text-[#0F294A]" />
          <h2 className="text-base font-bold text-slate-900">
            Panier ({totalItemsCount})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer"
            >
              Vider
            </button>
          )}
          {mobileCartOpen && (
            <button
              type="button"
              onClick={() => setMobileCartOpen(false)}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Fermer le panier"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Articles du panier */}
      <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-slate-100 max-h-[340px] lg:max-h-none">
        {cart.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-500">
              Le panier est vide
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Touchez un produit du catalogue pour l’ajouter.
            </p>
          </div>
        ) : (
          cart.map((item) => {
            const subtotal = Math.round(item.product.price * item.quantity);
            return (
              <div key={item.product.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-slate-500 font-mono-num">
                      {formatAriary(item.product.price, currency)} ×{' '}
                      {item.quantity} · Stock max : {item.product.stock_qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-[#0F294A] font-mono-num">
                      {formatAriary(subtotal, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      aria-label={`Supprimer ${item.product.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCartQuantity(item.product.id, item.quantity - 1)
                    }
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer"
                    aria-label="Diminuer la quantité"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={item.product.product_type === 'HOMEMADE' ? undefined : item.product.stock_qty}
                    value={item.quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val)) {
                        updateCartQuantity(item.product.id, val);
                      }
                    }}
                    className="w-16 min-h-[40px] text-center font-mono-num text-sm font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-[#0F294A]"
                    aria-label="Quantité"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateCartQuantity(item.product.id, item.quantity + 1)
                    }
                    disabled={item.product.product_type !== 'HOMEMADE' && item.quantity >= item.product.stock_qty}
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    aria-label="Augmenter la quantité"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-200 p-4 space-y-2.5"><p className="text-sm font-semibold text-slate-800">Informations de l'acheteur (facultatif)</p><input aria-label="Nom de l'acheteur" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom et prénom (facultatif)" className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" /><input aria-label="Téléphone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Téléphone (facultatif)" className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" /><input aria-label="E-mail" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="E-mail (facultatif)" className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" /><input aria-label="Adresse" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Adresse (facultatif)" className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" /></div>
      {/* Récapitulatif, paiement et monnaie */}
      <div className="border-t border-slate-200 bg-slate-50/70 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">
            Total général
          </span>
          <span className="text-2xl font-extrabold text-[#0F294A] font-mono-num">
            {formatAriary(cartTotal, currency)}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="pos-amount-paid"
              className="text-xs font-semibold text-slate-700"
            >
              Montant payé par le client ({currency})
            </label>
            {cartTotal > 0 && (
              <button
                type="button"
                onClick={() => setAmountPaidText(String(cartTotal))}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#0F294A] cursor-pointer"
              >
                Montant exact
              </button>
            )}
          </div>
          <input
            id="pos-amount-paid"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={amountPaidText}
            onChange={(e) => {
              setError('');
              setAmountPaidText(e.target.value);
            }}
            placeholder="Ex. 15000"
            className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-base font-bold font-mono-num text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#0F294A]"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setError('');
                  setAmountPaidText(String(amt));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-num font-medium text-slate-700 hover:border-[#0F294A] hover:text-[#0F294A] cursor-pointer"
              >
                {formatNumber(amt)}
              </button>
            ))}
          </div>
        </div>

        {/* Monnaie à rendre */}
        <div
          className={`rounded-xl px-4 py-3 border flex items-center justify-between ${
            cartTotal === 0
              ? 'bg-white border-slate-200 text-slate-600'
              : changeAmount >= 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span className="text-xs font-semibold">
            {cartTotal > 0 && changeAmount < 0
              ? 'Reste à payer'
              : 'Monnaie à rendre'}
          </span>
          <span className="text-lg font-extrabold font-mono-num">
            {cartTotal === 0
              ? `0 ${currency}`
              : formatAriary(Math.abs(changeAmount), currency)}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleValidateSale}
          disabled={
            submitting || cart.length === 0 || numericAmountPaid < cartTotal
          }
          className="w-full min-h-[48px] rounded-xl bg-[#0F294A] text-white text-sm font-bold tracking-wide hover:bg-[#163A66] active:scale-[0.99] transition-all disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? 'ENREGISTREMENT...' : 'VALIDER LA VENTE'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F294A] tracking-tight">
            Point de vente
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Caissier : {currentUser.full_name}
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#0F294A]"
          />
        </div>
      </div>

      {/* Filtres rapides par catégorie */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Filtrer par catégorie">
        {['Toutes', ...productCategories].map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setCategoryFilter(category)}
            className={`shrink-0 min-h-[38px] px-3.5 py-2 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
              categoryFilter === category
                ? 'bg-[#0F294A] border-[#0F294A] text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:border-[#0F294A]'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Grille Catalogue + Panier Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 xl:col-span-8">
          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
              <p className="text-sm font-medium text-slate-600">
                Aucun produit trouvé{categoryFilter !== 'Toutes' ? ` dans « ${categoryFilter} »` : ''}{search ? ` pour « ${search} »` : ''}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {visibleProducts.map((product) => {
                const inCartQty = getCartQuantity(product.id);
                const outOfStock = product.product_type !== 'HOMEMADE' && product.stock_qty === 0;
                const lowStock =
                  !outOfStock && product.stock_qty <= product.min_stock;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={outOfStock}
                    className={`text-left rounded-2xl border p-4 transition-all min-h-[116px] flex flex-col justify-between ${
                      outOfStock
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        : inCartQty > 0
                        ? 'bg-sky-50/60 border-[#2563EB] shadow-xs cursor-pointer'
                        : 'bg-white border-slate-200 hover:border-[#0F294A] active:scale-[0.99] cursor-pointer'
                    }`}
                  >
                    {product.image_data_url && <img src={product.image_data_url} alt={product.name} loading="lazy" className="w-full aspect-square max-h-36 object-cover rounded-xl mb-3" />}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {product.category || 'Autres'}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {product.name}
                        </h3>
                      </div>
                      {inCartQty > 0 && (
                        <span className="shrink-0 font-mono-num text-xs font-bold text-[#0F294A]">
                          ×{inCartQty}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-2">
                      <span className="text-base font-extrabold text-[#0F294A] font-mono-num">
                        {formatAriary(product.price, currency)}
                      </span>
                      <span
                        className={`text-xs font-medium font-mono-num ${
                          outOfStock
                            ? 'text-red-600'
                            : lowStock
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {outOfStock
                          ? 'Rupture'
                          : `Stock : ${product.stock_qty}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {filteredProducts.length > pageSize && <div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-500">Page {productPage + 1} / {pageCount}</span><div className="flex gap-2"><button type="button" disabled={productPage === 0} onClick={() => setProductPage((p) => Math.max(0, p - 1))} className="min-h-[38px] px-3 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Précédent</button><button type="button" disabled={productPage >= pageCount - 1} onClick={() => setProductPage((p) => Math.min(pageCount - 1, p + 1))} className="min-h-[38px] px-3 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Suivant</button></div></div>}
        </div>

        {/* Panier Desktop */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20">
          {renderCartPanel()}
        </div>
      </div>

      {/* Barre flottante Panier sur Mobile */}
      <div className="lg:hidden fixed bottom-[68px] left-0 right-0 z-30 px-4 pb-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="pointer-events-auto w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#0F294A] text-white shadow-lg flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5 text-[#38BDF8]" />
            <span className="text-sm font-semibold">
              Panier · {totalItemsCount} article{totalItemsCount > 1 ? 's' : ''}
            </span>
          </div>
          <span className="font-mono-num text-sm font-extrabold">
            {formatAriary(cartTotal, currency)}
          </span>
        </button>
      </div>

      {/* Panier Mobile (Sheet) */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end">
          <div className="w-full max-h-[90vh] flex flex-col rounded-t-3xl overflow-hidden bg-white">
            {renderCartPanel()}
          </div>
        </div>
      )}

      {/* Modale Confirmation Vente Réussie */}
      {completedSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Vente enregistrée avec succès
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {completedSale.sale_number} ·{' '}
                  {formatDateTime(completedSale.sale_date)}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-b border-slate-200 py-3 space-y-2 max-h-52 overflow-y-auto">
              {completedSale.details.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-700">
                    {d.product_name}{' '}
                    <span className="text-slate-400 font-mono text-xs">
                      ×{d.quantity}
                    </span>
                  </span>
                  <span className="font-mono-num font-semibold text-slate-900">
                    {formatAriary(d.subtotal, currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between font-bold text-[#0F294A]">
                <span>Total payé</span>
                <span className="font-mono-num">
                  {formatAriary(completedSale.total_amount, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Montant reçu</span>
                <span className="font-mono-num">
                  {formatAriary(completedSale.amount_paid, currency)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700">
                <span>Monnaie rendue</span>
                <span className="font-mono-num">
                  {formatAriary(completedSale.change_given, currency)}
                </span>
              </div>
            </div>

            {autoPrintMessage && (
              <div className="mt-4 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-[#0F294A]">
                {autoPrintMessage}
              </div>
            )}

            <div className="mt-6 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPdfPreviewSale(completedSale)}
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Imprimer facture A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setThermalPreviewSale(completedSale)}
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer ticket thermique</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="w-full min-h-[44px] rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
              >
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}

      <InvoicePdfModal
        sale={pdfPreviewSale}
        settings={settings}
        onClose={() => setPdfPreviewSale(null)}
      />

      <ThermalReceiptModal
        sale={thermalPreviewSale}
        settings={settings}
        onClose={() => setThermalPreviewSale(null)}
      />
    </div>
  );
};
