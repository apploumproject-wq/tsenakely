import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Bluetooth,
  Check,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  Info,
  KeyRound,
  LogOut,
  Package,
  Plus,
  Printer,
  Search,
  Shield,
  Smartphone,
  Store,
  Trash2,
  Upload,
  Usb,
  Users,
  X,
} from 'lucide-react';
import {AppFooterSignature} from '../components/AppFooterSignature';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {ExcelExportPanel} from '../components/ExcelExportPanel';
import {PWAInstallButton} from '../components/PWAInstallButton';
import {tsenakelyDb} from '../db/database';
import type {
  AppSettings,
  PrinterConnectionMode,
  PrinterPaperWidth,
  Product,
  StockMovement,
  User,
  UserRole,
} from '../db/types';
import {exportAndroidStudioProjectZip} from '../utils/androidProjectExporter';
import {formatAriary, formatDateOnly, formatDateTime} from '../utils/format';
import {
  printThermalHtmlWindow,
  thermalPrinter,
  type PrinterConnectionStatus,
} from '../utils/thermalPrinter';

interface SettingsPageProps {
  currentUser: User;
  settings: AppSettings;
  refreshKey: number;
  onDataChanged: () => void;
  onSettingsUpdated: (next: AppSettings) => void;
  onLogout: () => void;
}

type SettingsSection =
  | 'produits'
  | 'utilisateurs'
  | 'application'
  | 'impression'
  | 'sauvegarde'
  | 'apropos';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  settings,
  refreshKey,
  onDataChanged,
  onSettingsUpdated,
  onLogout,
}) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const currency = settings.currency || 'Ar';

  const [section, setSection] = useState<SettingsSection>('produits');
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ===== PRODUITS & STOCKS =====
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [showMovementsModal, setShowMovementsModal] = useState(false);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodMinStock, setProdMinStock] = useState('5');

  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(
    null
  );
  const [stockDelta, setStockDelta] = useState('10');
  const [stockReason, setStockReason] = useState('Réapprovisionnement');

  const [deleteProductTarget, setDeleteProductTarget] =
    useState<Product | null>(null);

  // ===== UTILISATEURS =====
  const [users, setUsers] = useState<User[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uFullName, setUFullName] = useState('');
  const [uRole, setURole] = useState<UserRole>('VENDEUR');
  const [uPassword, setUPassword] = useState('');
  const [uActive, setUActive] = useState(true);

  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);

  // Mot de passe personnel
  const [ownOldPwd, setOwnOldPwd] = useState('');
  const [ownNewPwd, setOwnNewPwd] = useState('');
  const [ownConfirmPwd, setOwnConfirmPwd] = useState('');

  // ===== APPLICATION & IMPRESSION =====
  const [formSettings, setFormSettings] = useState<AppSettings>(settings);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [printerStatus, setPrinterStatus] = useState<PrinterConnectionStatus>(
    thermalPrinter.getStatus()
  );

  // ===== RESTAURATION =====
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(
    null
  );
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    return thermalPrinter.subscribe(setPrinterStatus);
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setNotice({type, text});
  };

  const loadProducts = useCallback(async () => {
    const list = await tsenakelyDb.getProducts(productSearch);
    setProducts(list);
  }, [productSearch]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    const list = await tsenakelyDb.getUsers();
    setUsers(list);
  }, [isAdmin]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, refreshKey]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

  useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  // ----- Handlers Produits -----
  const openAddProduct = () => {
    setEditingProduct(null);
    setProdName('');
    setProdPrice('');
    setProdStock('10');
    setProdMinStock('5');
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProdName(p.name);
    setProdPrice(String(p.price));
    setProdStock(String(p.stock_qty));
    setProdMinStock(String(p.min_stock));
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      const price = Number(prodPrice);
      const minStock = parseInt(prodMinStock, 10);
      if (editingProduct) {
        await tsenakelyDb.updateProduct(editingProduct.id, {
          name: prodName,
          price,
          min_stock: minStock,
        });
        showMessage('success', `Produit « ${prodName} » mis à jour.`);
      } else {
        const stockQty = parseInt(prodStock, 10);
        await tsenakelyDb.addProduct(
          {
            name: prodName,
            price,
            stock_qty: stockQty,
            min_stock: minStock,
          },
          currentUser.full_name
        );
        showMessage('success', `Produit « ${prodName} » ajouté au catalogue.`);
      }
      setProductModalOpen(false);
      await loadProducts();
      onDataChanged();
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Erreur enregistrement produit.'
      );
    }
  };

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModalProduct) return;
    setNotice(null);
    try {
      const delta = parseInt(stockDelta, 10);
      await tsenakelyDb.adjustStock(
        stockModalProduct.id,
        delta,
        stockReason,
        currentUser.full_name
      );
      showMessage(
        'success',
        `Stock mis à jour pour « ${stockModalProduct.name} ».`
      );
      setStockModalProduct(null);
      await loadProducts();
      onDataChanged();
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Erreur ajustement stock.'
      );
    }
  };

  const handleConfirmDeleteProduct = async () => {
    if (!deleteProductTarget) return;
    setBusyAction(true);
    try {
      await tsenakelyDb.deleteProduct(deleteProductTarget.id);
      showMessage(
        'success',
        `Produit « ${deleteProductTarget.name} » supprimé.`
      );
      setDeleteProductTarget(null);
      await loadProducts();
      onDataChanged();
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Suppression impossible.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const openStockMovements = async () => {
    const list = await tsenakelyDb.getStockMovements(80);
    setMovements(list);
    setShowMovementsModal(true);
  };

  // ----- Handlers Utilisateurs -----
  const openAddUser = () => {
    setEditingUser(null);
    setUUsername('');
    setUFullName('');
    setURole('VENDEUR');
    setUPassword('');
    setUActive(true);
    setUserModalOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUUsername(u.username);
    setUFullName(u.full_name);
    setURole(u.role);
    setUPassword('');
    setUActive(u.is_active);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      if (editingUser) {
        await tsenakelyDb.updateUser(
          editingUser.id,
          {
            username: uUsername,
            full_name: uFullName,
            role: uRole,
            is_active: uActive,
          },
          currentUser.id
        );
        showMessage('success', `Utilisateur « ${uFullName} » modifié.`);
      } else {
        await tsenakelyDb.createUser({
          username: uUsername,
          full_name: uFullName,
          role: uRole,
          password: uPassword,
        });
        showMessage('success', `Utilisateur « ${uFullName} » créé.`);
      }
      setUserModalOpen(false);
      await loadUsers();
      onDataChanged();
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Erreur utilisateur.'
      );
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser) return;
    setNotice(null);
    try {
      await tsenakelyDb.resetUserPassword(resetPwdUser.id, resetPwdValue);
      showMessage(
        'success',
        `Mot de passe réinitialisé pour ${resetPwdUser.full_name}.`
      );
      setResetPwdUser(null);
      setResetPwdValue('');
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Réinitialisation impossible.'
      );
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setBusyAction(true);
    try {
      await tsenakelyDb.deleteUser(deleteUserTarget.id, currentUser.id);
      showMessage(
        'success',
        `Utilisateur « ${deleteUserTarget.full_name} » supprimé.`
      );
      setDeleteUserTarget(null);
      await loadUsers();
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Suppression impossible.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (ownNewPwd !== ownConfirmPwd) {
      showMessage(
        'error',
        'La confirmation ne correspond pas au nouveau mot de passe.'
      );
      return;
    }
    try {
      await tsenakelyDb.changeOwnPassword(currentUser.id, ownOldPwd, ownNewPwd);
      setOwnOldPwd('');
      setOwnNewPwd('');
      setOwnConfirmPwd('');
      showMessage('success', 'Votre mot de passe a été modifié avec succès.');
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Erreur changement mot de passe.'
      );
    }
  };

  // ----- Handlers Paramètres App -----
  const handleSaveAppSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      await tsenakelyDb.updateSettings(formSettings);
      onSettingsUpdated(formSettings);
      showMessage('success', 'Paramètres du commerce enregistrés.');
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error ? err.message : 'Erreur sauvegarde paramètres.'
      );
    }
  };

  // ----- Handlers Sauvegarde / Export / Restauration -----
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportSqlite = async () => {
    const bytes = await tsenakelyDb.exportSqliteBytes();
    const dateTag = new Date().toISOString().slice(0, 10);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    triggerDownload(
      new Blob([copy.buffer], {type: 'application/x-sqlite3'}),
      `tsenakely-sauvegarde-${dateTag}.sqlite`
    );
    showMessage('success', 'Base de données SQLite exportée.');
  };

  const handleExportJson = async () => {
    const json = await tsenakelyDb.exportJsonBackup();
    const dateTag = new Date().toISOString().slice(0, 10);
    triggerDownload(
      new Blob([json], {type: 'application/json;charset=utf-8'}),
      `tsenakely-sauvegarde-${dateTag}.json`
    );
    showMessage('success', 'Sauvegarde JSON complète exportée.');
  };

  const handleExportCsv = async () => {
    const csv = await tsenakelyDb.exportSalesCsv();
    const dateTag = new Date().toISOString().slice(0, 10);
    triggerDownload(
      new Blob([csv], {type: 'text/csv;charset=utf-8'}),
      `tsenakely-ventes-${dateTag}.csv`
    );
    showMessage('success', 'Historique des ventes exporté en CSV.');
  };

  const handleExportAndroidZip = async () => {
    setBusyAction(true);
    try {
      const blob = await exportAndroidStudioProjectZip();
      triggerDownload(blob, 'TSENAKELY-Android-Studio-Kotlin.zip');
      showMessage(
        'success',
        'Projet Android Studio Kotlin/Room téléchargé (.zip).'
      );
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Erreur génération du projet Android.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return;
    setBusyAction(true);
    setNotice(null);
    try {
      if (pendingRestoreFile.name.toLowerCase().endsWith('.json')) {
        const text = await pendingRestoreFile.text();
        await tsenakelyDb.importJsonBackup(text);
      } else {
        const buf = await pendingRestoreFile.arrayBuffer();
        await tsenakelyDb.importSqliteBytes(new Uint8Array(buf));
      }
      setPendingRestoreFile(null);
      const updatedSettings = await tsenakelyDb.getSettings();
      onSettingsUpdated(updatedSettings);
      await loadProducts();
      await loadUsers();
      onDataChanged();
      showMessage('success', 'Sauvegarde restaurée avec succès.');
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Impossible de restaurer ce fichier.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleLogoFileChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 220;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png');
          setFormSettings((prev) => ({...prev, shop_logo_data_url: dataUrl}));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConnectBtPrinter = async () => {
    setNotice(null);
    setBusyAction(true);
    try {
      const name = await thermalPrinter.connectBluetooth();
      const updated = {
        ...formSettings,
        printer_connection_mode: 'BLUETOOTH' as PrinterConnectionMode,
        printer_device_name: name,
      };
      setFormSettings(updated);
      await tsenakelyDb.updateSettings(updated);
      onSettingsUpdated(updated);
      showMessage('success', `Imprimante Bluetooth connectée : ${name}`);
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Impossible de connecter une imprimante Bluetooth.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleConnectUsbPrinter = async () => {
    setNotice(null);
    setBusyAction(true);
    try {
      const name = await thermalPrinter.connectUsb();
      const updated = {
        ...formSettings,
        printer_connection_mode: 'USB' as PrinterConnectionMode,
        printer_device_name: name,
      };
      setFormSettings(updated);
      await tsenakelyDb.updateSettings(updated);
      onSettingsUpdated(updated);
      showMessage('success', `Imprimante USB connectée : ${name}`);
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Impossible de connecter une imprimante USB.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await thermalPrinter.disconnect();
    showMessage('success', 'Imprimante déconnectée.');
  };

  const handleTestThermalPrint = async () => {
    setNotice(null);
    if (formSettings.printer_connection_mode === 'SYSTEM') {
      printThermalHtmlWindow(
        {
          id: 0,
          sale_number: 'TEST-IMPRESSION',
          sale_date: new Date().toISOString(),
          user_id: currentUser.id,
          user_name: currentUser.full_name,
          total_amount: 3000,
          amount_paid: 5000,
          change_given: 2000,
          status: 'COMPLETED',
          cancelled_at: null,
          cancelled_by: null,
          cancel_reason: null,
          details: [
            {
              id: 1,
              sale_id: 0,
              product_id: 1,
              product_name: `Test papier ${formSettings.printer_paper_width} mm`,
              unit_price: 3000,
              quantity: 1,
              subtotal: 3000,
            },
          ],
        },
        formSettings
      );
      return;
    }

    setBusyAction(true);
    try {
      await thermalPrinter.printTestReceipt(formSettings);
      showMessage(
        'success',
        `Ticket de test envoyé (${formSettings.printer_paper_width} mm).`
      );
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Imprimante déconnectée ou indisponible.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleSavePrinterSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      await tsenakelyDb.updateSettings(formSettings);
      onSettingsUpdated(formSettings);
      showMessage('success', 'Paramètres d’impression enregistrés.');
    } catch (err) {
      showMessage(
        'error',
        err instanceof Error
          ? err.message
          : 'Erreur enregistrement paramètres impression.'
      );
    }
  };

  const sections: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ComponentType<{className?: string}>;
  }> = [
    {id: 'produits', label: 'Produits & Stocks', icon: Package},
    {id: 'utilisateurs', label: 'Utilisateurs', icon: Users},
    {id: 'application', label: 'Commerce', icon: Store},
    {id: 'impression', label: 'Impression', icon: Printer},
    {id: 'sauvegarde', label: 'Sauvegarde & Excel', icon: Database},
    {id: 'apropos', label: 'À propos', icon: Info},
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F294A] tracking-tight">
            Paramètres
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Session : <strong>{currentUser.full_name}</strong> ·{' '}
            {currentUser.role === 'ADMIN' ? 'Administrateur' : 'Vendeur'}
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 self-start cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Se déconnecter</span>
        </button>
      </div>

      {/* Navigation des sous-sections */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl w-fit max-w-full">
        {sections.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setNotice(null);
                setSection(item.id);
              }}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#0F294A] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white/70'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium border flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Fermer la notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== 1. PRODUITS & STOCKS ==================== */}
      {section === 'produits' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Rechercher un produit..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-[#0F294A]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={openStockMovements}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer"
              >
                <History className="w-4 h-4 text-[#0F294A]" />
                <span>Mouvements stock</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={openAddProduct}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter un produit</span>
                </button>
              )}
            </div>
          </div>

          {!isAdmin && (
            <p className="text-xs text-slate-500">
              Mode consultation : seul un administrateur peut modifier les prix,
              ajouter ou supprimer des produits.
            </p>
          )}

          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-semibold">
                      Produit
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Prix de vente
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Stock
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Seuil min.
                    </th>
                    <th className="text-left px-4 py-3.5 font-semibold">
                      Créé le
                    </th>
                    {isAdmin && (
                      <th className="text-right px-5 py-3.5 font-semibold">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 6 : 5}
                        className="px-5 py-10 text-center text-sm text-slate-500"
                      >
                        Aucun produit trouvé.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => {
                      const out = p.stock_qty === 0;
                      const low = !out && p.stock_qty <= p.min_stock;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {p.name}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono-num font-bold text-[#0F294A]">
                            {formatAriary(p.price, currency)}
                          </td>
                          <td
                            className={`px-4 py-3.5 text-right font-mono-num font-bold ${
                              out
                                ? 'text-red-600'
                                : low
                                ? 'text-amber-700'
                                : 'text-slate-900'
                            }`}
                          >
                            {p.stock_qty}
                            {out ? ' (Rupture)' : low ? ' (Faible)' : ''}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono-num text-slate-500">
                            {p.min_stock}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 font-mono-num">
                            {formatDateOnly(p.created_at)}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStockModalProduct(p);
                                    setStockDelta('10');
                                    setStockReason('Réapprovisionnement');
                                  }}
                                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 cursor-pointer"
                                >
                                  + Stock
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditProduct(p)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                                  aria-label={`Modifier ${p.name}`}
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteProductTarget(p)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                                  aria-label={`Supprimer ${p.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. UTILISATEURS ==================== */}
      {section === 'utilisateurs' && (
        <div className="space-y-6">
          {isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Comptes utilisateurs ({users.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Gérez les accès Administrateur et Vendeur. Mots de passe
                    hachés par SHA-256.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddUser}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nouvel utilisateur</span>
                </button>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {u.full_name}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          @{u.username}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Rôle :{' '}
                        <strong className="text-[#0F294A]">
                          {u.role === 'ADMIN' ? 'Administrateur' : 'Vendeur'}
                        </strong>{' '}
                        · Statut :{' '}
                        <span
                          className={
                            u.is_active ? 'text-emerald-700' : 'text-red-600'
                          }
                        >
                          {u.is_active ? 'Actif' : 'Désactivé'}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditUser(u)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetPwdUser(u);
                          setResetPwdValue('');
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium text-[#0F294A] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Réinitialiser MDP</span>
                      </button>
                      {u.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => setDeleteUserTarget(u)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Changement de son propre mot de passe (Admin & Vendeur) */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 max-w-xl">
            <div className="flex items-center gap-2.5 mb-4">
              <Shield className="w-5 h-5 text-[#0F294A]" />
              <h2 className="text-base font-bold text-slate-900">
                Changer mon mot de passe
              </h2>
            </div>

            <form onSubmit={handleChangeOwnPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  required
                  value={ownOldPwd}
                  onChange={(e) => setOwnOldPwd(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={ownNewPwd}
                    onChange={(e) => setOwnNewPwd(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={ownConfirmPwd}
                    onChange={(e) => setOwnConfirmPwd(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
              >
                Mettre à jour mon mot de passe
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== 3. APPLICATION & COMMERCE ==================== */}
      {section === 'application' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              Informations du commerce
            </h2>
            <form onSubmit={handleSaveAppSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du commerce
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={formSettings.shop_name}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      shop_name: e.target.value,
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Devise affichée
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formSettings.currency}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        currency: e.target.value,
                      })
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formSettings.shop_phone}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        shop_phone: e.target.value,
                      })
                    }
                    placeholder="Ex. 034 00 000 00"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adresse du commerce
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={formSettings.shop_address}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      shop_address: e.target.value,
                    })
                  }
                  placeholder="Ex. Antananarivo, Madagascar"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Message de bas de ticket
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={formSettings.receipt_footer}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      receipt_footer: e.target.value,
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#0F294A]"
                />
              </div>

              {/* Logo du commerce pour les factures A4 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Logo du commerce (affiché sur les factures A4)
                </label>
                <div className="flex items-center gap-3">
                  {formSettings.shop_logo_data_url ? (
                    <img
                      src={formSettings.shop_logo_data_url}
                      alt="Logo commerce"
                      className="w-14 h-14 rounded-xl border border-slate-200 object-contain bg-slate-50 p-1"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoFileChange(f);
                      e.target.value = '';
                    }}
                  />
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 cursor-pointer"
                      >
                        Choisir un logo
                      </button>
                      {formSettings.shop_logo_data_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormSettings({
                              ...formSettings,
                              shop_logo_data_url: '',
                            })
                          }
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={formSettings.low_stock_alert_enabled}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      low_stock_alert_enabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#0F294A]"
                />
                <span className="text-sm text-slate-700">
                  Afficher les alertes de stock faible sur le tableau de bord
                </span>
              </label>

              {isAdmin && (
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer les informations</span>
                </button>
              )}
            </form>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-[#2563EB]" />
                <h2 className="text-base font-bold text-slate-900">
                  Installation hors ligne sur téléphone
                </h2>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Installez TSENAKELY sur votre appareil Android pour l’ouvrir en
                plein écran depuis votre bureau et enregistrer vos ventes même
                sans connexion Internet.
              </p>
              <PWAInstallButton variant="card" />
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Sécurité et stockage local
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Toutes les données (utilisateurs, produits, ventes, mouvements de
                stock) sont conservées localement dans une base SQLite stockée sur
                cet appareil et persistée automatiquement après chaque opération.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 4. PARAMÈTRES D'IMPRESSION ==================== */}
      {section === 'impression' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#0F294A]">
                Paramètres d’impression thermique (ESC/POS)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Configurez votre imprimante thermique Bluetooth/USB et le format
                du rouleau papier. L’impression reste facultative pour valider
                une vente.
              </p>
            </div>

            <form onSubmit={handleSavePrinterSettings} className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Format du papier thermique
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(['58', '80'] as PrinterPaperWidth[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        setFormSettings({...formSettings, printer_paper_width: w})
                      }
                      className={`min-h-[46px] rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                        formSettings.printer_paper_width === w
                          ? 'bg-[#0F294A] border-[#0F294A] text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {w} mm ({w === '58' ? '32 col.' : '48 col.'})
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Mode de connexion imprimante
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      ['BLUETOOTH', 'Bluetooth'],
                      ['USB', 'USB (OTG)'],
                      ['SYSTEM', 'Système'],
                    ] as Array<[PrinterConnectionMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          printer_connection_mode: mode,
                        })
                      }
                      className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        formSettings.printer_connection_mode === mode
                          ? 'bg-[#0F294A] border-[#0F294A] text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-3 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.printer_auto_print_sale}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      printer_auto_print_sale: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 accent-[#0F294A]"
                />
                <span className="text-sm text-slate-700">
                  Imprimer directement le ticket thermique après validation d’une
                  vente (si imprimante connectée)
                </span>
              </label>

              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Enregistrer la configuration</span>
              </button>
            </form>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Connexion et test imprimante
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Statut actuel :{' '}
                <strong
                  className={
                    printerStatus.connected
                      ? 'text-emerald-700'
                      : 'text-slate-700'
                  }
                >
                  {printerStatus.connected
                    ? `Connectée (${printerStatus.deviceName} · ${printerStatus.mode})`
                    : 'Déconnectée'}
                </strong>
              </p>
              {formSettings.printer_device_name && !printerStatus.connected && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Dernière imprimante utilisée :{' '}
                  {formSettings.printer_device_name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={busyAction}
                onClick={handleConnectBtPrinter}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Bluetooth className="w-4 h-4 text-[#38BDF8]" />
                <span>Rechercher et connecter une imprimante Bluetooth</span>
              </button>

              <button
                type="button"
                disabled={busyAction}
                onClick={handleConnectUsbPrinter}
                className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Usb className="w-4 h-4" />
                <span>Connecter une imprimante USB</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={handleTestThermalPrint}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Tester l’impression</span>
                </button>

                {printerStatus.connected && (
                  <button
                    type="button"
                    onClick={handleDisconnectPrinter}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    Déconnecter
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Si votre imprimante thermique utilise le Bluetooth classique
              Android (SPP) non exposé à Web Bluetooth, sélectionnez le mode{' '}
              <strong>Système</strong> ou utilisez le téléchargement de trame{' '}
              <code>.bin</code> ESC/POS depuis l’aperçu du ticket.
            </p>
          </div>
        </div>
      )}

      {/* ==================== 5. SAUVEGARDE & EXPORT EXCEL ==================== */}
      {section === 'sauvegarde' && (
        <div className="space-y-6">
          <ExcelExportPanel settings={settings} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Sauvegardes base de données & CSV
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Téléchargez une copie complète de votre base locale ou exportez
                l’historique au format CSV.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleExportSqlite}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Exporter la base complète (.sqlite)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Exporter la sauvegarde (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Exporter l’historique des ventes (.csv)</span>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {isAdmin && (
                <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
                  <h2 className="text-base font-bold text-slate-900">
                    Restaurer une sauvegarde
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Importez un fichier <code>.sqlite</code> ou <code>.json</code>{' '}
                    précédemment exporté. Une confirmation vous sera demandée
                    avant le remplacement des données actuelles.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sqlite,.db,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPendingRestoreFile(file);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Sélectionner un fichier de sauvegarde</span>
                  </button>
                </div>
              )}

              <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Code source Android Studio (Kotlin + Room)
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Téléchargez l’architecture complète du projet Android Studio (
                  <code>com.tsenakely.gestion</code>, Android 6.0+ API 23+) pour
                  compiler un APK natif localement.
                </p>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={handleExportAndroidZip}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le projet Android Studio (.zip)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 5. À PROPOS ==================== */}
      {section === 'apropos' && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 max-w-2xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0F294A] flex items-center justify-center shrink-0">
              <Store className="w-7 h-7 text-[#38BDF8]" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#0F294A]">
                TSENAKELY
              </h2>
              <p className="text-sm text-slate-600">
                Application de gestion commerciale hors ligne · Devise Ariary (Ar)
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
            <p>
              TSENAKELY permet aux petits commerces de gérer simplement leurs
              ventes au comptoir, leur catalogue produits, leurs niveaux de
              stock, l’historique complet des transactions et leurs statistiques
              commerciales sans aucune dépendance à Internet.
            </p>
            <p>
              Toutes les opérations critiques (ventes, déduction de stock,
              annulations) sont exécutées via des transactions SQLite locales pour
              garantir la cohérence des données.
            </p>
          </div>

          <AppFooterSignature align="left" />
        </div>
      )}

      {/* ==================== MODALES ==================== */}

      {/* Modale Ajout / Édition Produit */}
      {productModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-[#0F294A]">
                {editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du produit
                </label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Ex. Glace double"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prix de vente ({currency})
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={50}
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="Ex. 3000"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-[#0F294A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!editingProduct && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Stock initial
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      value={prodStock}
                      onChange={(e) => setProdStock(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-[#0F294A]"
                    />
                  </div>
                )}
                <div className={editingProduct ? 'col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Stock minimum (alerte)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={prodMinStock}
                    onChange={(e) => setProdMinStock(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Ajustement de stock */}
      {stockModalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#0F294A]">
                  Ajuster le stock
                </h3>
                <p className="text-xs text-slate-500">
                  {stockModalProduct.name} · Stock actuel :{' '}
                  <strong className="font-mono-num">
                    {stockModalProduct.stock_qty}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStockModalProduct(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantité à ajouter (ou négatif pour retirer)
                </label>
                <input
                  type="number"
                  required
                  step={1}
                  value={stockDelta}
                  onChange={(e) => setStockDelta(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motif
                </label>
                <input
                  type="text"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  placeholder="Ex. Livraison fournisseur"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setStockModalProduct(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
                >
                  Valider le mouvement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Journal des mouvements de stock */}
      {showMovementsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F294A]">
                Mouvements de stock récents
              </h3>
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 p-4">
              {movements.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Aucun mouvement enregistré.
                </p>
              ) : (
                movements.map((m) => (
                  <div
                    key={m.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {m.product_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(m.created_at)} · {m.reason} ·{' '}
                        {m.user_name}
                      </p>
                    </div>
                    <div className="text-right font-mono-num shrink-0">
                      <span
                        className={`text-sm font-bold ${
                          m.qty_change >= 0
                            ? 'text-emerald-700'
                            : 'text-red-600'
                        }`}
                      >
                        {m.qty_change >= 0 ? `+${m.qty_change}` : m.qty_change}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {m.qty_before} → {m.qty_after}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale Ajout / Édition Utilisateur */}
      {userModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-[#0F294A]">
                {editingUser
                  ? 'Modifier l’utilisateur'
                  : 'Ajouter un utilisateur'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  required
                  value={uFullName}
                  onChange={(e) => setUFullName(e.target.value)}
                  placeholder="Ex. Rabe Jean"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Identifiant de connexion
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={uUsername}
                  onChange={(e) => setUUsername(e.target.value)}
                  placeholder="Ex. vendeur1"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rôle
                </label>
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as UserRole)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-[#0F294A]"
                >
                  <option value="VENDEUR">Vendeur</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>
              {!editingUser ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mot de passe initial
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={uPassword}
                    onChange={(e) => setUPassword(e.target.value)}
                    placeholder="Minimum 4 caractères"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              ) : (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uActive}
                    onChange={(e) => setUActive(e.target.checked)}
                    className="w-4 h-4 accent-[#0F294A]"
                  />
                  <span className="text-sm text-slate-700">Compte actif</span>
                </label>
              )}

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Réinitialisation mot de passe utilisateur */}
      {resetPwdUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#0F294A]">
              Réinitialiser le mot de passe
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Utilisateur : <strong>{resetPwdUser.full_name}</strong> (@
              {resetPwdUser.username})
            </p>
            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  placeholder="Minimum 4 caractères"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetPwdUser(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] cursor-pointer"
                >
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmations destructives */}
      <ConfirmDialog
        open={!!deleteProductTarget}
        title={`Supprimer « ${deleteProductTarget?.name} » ?`}
        message="Le produit sera retiré du catalogue. Les ventes passées conserveront néanmoins l'historique de ce produit."
        confirmLabel="Supprimer le produit"
        loading={busyAction}
        onConfirm={handleConfirmDeleteProduct}
        onCancel={() => setDeleteProductTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteUserTarget}
        title={`Supprimer l’utilisateur ${deleteUserTarget?.full_name} ?`}
        message="Ce compte ne pourra plus se connecter à TSENAKELY."
        confirmLabel="Supprimer l’utilisateur"
        loading={busyAction}
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => setDeleteUserTarget(null)}
      />

      <ConfirmDialog
        open={!!pendingRestoreFile}
        title="Restaurer cette sauvegarde ?"
        message={`Le fichier « ${pendingRestoreFile?.name} » va remplacer l'ensemble des données locales actuelles (produits, utilisateurs, ventes). Cette action est irréversible.`}
        confirmLabel="Restaurer maintenant"
        loading={busyAction}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPendingRestoreFile(null)}
      />
    </div>
  );
};
