import React, {useEffect, useMemo, useState} from 'react';
import {CalendarDays, CheckCircle2, Clock3, Factory, Plus, Save, X} from 'lucide-react';
import {tsenakelyDb} from '../db/database';
import type {ProductionBatch, ProductionIngredientInput, Product, User} from '../db/types';
import {formatAriary} from '../utils/format';

interface Props { currentUser: User; refreshKey: number; onDataChanged: () => void; }
type IngredientDraft = ProductionIngredientInput & {key: number};
const blankIngredient = (key:number):IngredientDraft => ({key,name:'',purchase_quantity:1,purchase_unit:'kg',purchase_price:0,used_quantity:1,used_unit:'kg'});

export const ProductsPage: React.FC<Props> = ({currentUser,refreshKey,onDataChanged}) => {
  const [products,setProducts]=useState<Product[]>([]);
  const [batches,setBatches]=useState<ProductionBatch[]>([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState<{type:'success'|'error';text:string}|null>(null);
  const [name,setName]=useState(''); const [price,setPrice]=useState(''); const [category,setCategory]=useState('Autres');
  const [productType,setProductType]=useState<'FINISHED'|'HOMEMADE'>('FINISHED');
  const [hasSizeVariants,setHasSizeVariants]=useState(false);
  const [selectedProduct,setSelectedProduct]=useState('');
  const [producedAt,setProducedAt]=useState(new Date().toISOString().slice(0,10));
  const [ingredients,setIngredients]=useState<IngredientDraft[]>([blankIngredient(1)]);
  const [saving,setSaving]=useState(false);
  const reload=async()=>{setLoading(true);try{const [p,b]=await Promise.all([tsenakelyDb.getProducts(),tsenakelyDb.getProductionBatches()]);setProducts(p);setBatches(b);if(!selectedProduct){const first=p.find(x=>x.product_type==='HOMEMADE');if(first)setSelectedProduct(String(first.id));}}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Chargement impossible.'});}finally{setLoading(false);}};
  useEffect(()=>{void reload();},[refreshKey]);
  const homemade=products.filter(p=>p.product_type==='HOMEMADE');
  const activeBatches=batches.filter(b=>b.status==='ACTIVE');
  const closedBatches=batches.filter(b=>b.status==='CLOSED');
  const estimatedCost=useMemo(()=>ingredients.reduce((sum,i)=>sum+(i.purchase_quantity>0?Math.round(i.used_quantity/i.purchase_quantity*i.purchase_price):0),0),[ingredients]);
  const updateIngredient=(key:number,patch:Partial<IngredientDraft>)=>setIngredients(prev=>prev.map(i=>i.key===key?{...i,...patch}:i));
  const createProduct=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setNotice(null);try{const p=await tsenakelyDb.addProduct({name,price:Number(price),stock_qty:0,min_stock:0,category,has_size_variants:productType==='HOMEMADE'&&hasSizeVariants},currentUser.full_name);await tsenakelyDb.setProductType(p.id,productType);setName('');setPrice('');setHasSizeVariants(false);setNotice({type:'success',text:'Produit créé. Il est disponible dans le catalogue de vente.'});await reload();onDataChanged();}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Création impossible.'});}finally{setSaving(false);}};
  const startBatch=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setNotice(null);try{await tsenakelyDb.startProduction(Number(selectedProduct),producedAt,ingredients.map(({key,...item})=>item));setNotice({type:'success',text:'Fabrication enregistrée. Les ventes seront comptées jusqu’à sa clôture.'});setIngredients([blankIngredient(Date.now())]);await reload();onDataChanged();}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Impossible de démarrer la fabrication.'});}finally{setSaving(false);}};
  const changeProductType=async(product:Product,next:'FINISHED'|'HOMEMADE')=>{try{await tsenakelyDb.setProductType(product.id,next);setNotice({type:'success',text:`Type de « ${product.name} » mis à jour.`});await reload();onDataChanged();}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Modification impossible.'});}};
  const changeSizeVariants=async(product:Product,enabled:boolean)=>{try{await tsenakelyDb.setProductSizeVariants(product.id,enabled);setNotice({type:'success',text:enabled?'Formats Simple/Double activés.':'Formats Simple/Double désactivés.'});await reload();onDataChanged();}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Modification impossible.'});}};
  const closeBatch=async(batch:ProductionBatch)=>{if(!window.confirm('Confirmer « Stock épuisé » ? La fabrication sera clôturée et son bénéfice calculé à partir des ventes enregistrées.'))return;setSaving(true);setNotice(null);try{await tsenakelyDb.closeProduction(batch.id);setNotice({type:'success',text:'Fabrication clôturée. Son bilan est conservé dans l’historique.'});await reload();onDataChanged();}catch(e){setNotice({type:'error',text:e instanceof Error?e.message:'Clôture impossible.'});}finally{setSaving(false);}};
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-extrabold text-slate-900">Produits</h1><p className="mt-1 text-sm text-slate-500">Catalogue, fabrication maison et calcul des bénéfices.</p></div>
    {notice&&<div role="status" className={`rounded-xl border p-3 text-sm ${notice.type==='success'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-slate-900">Ajouter un produit</h2></div>
      <form onSubmit={createProduct} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs font-semibold text-slate-600">Nom du produit<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex. Glace vanille" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"/></label>
        <label className="text-xs font-semibold text-slate-600">Prix de vente (Ar)<input required min="0" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="1500" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"/></label>
        <label className="text-xs font-semibold text-slate-600">Catégorie<input value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"/></label>
        <label className="text-xs font-semibold text-slate-600">Type de produit<select value={productType} onChange={e=>{setProductType(e.target.value as 'FINISHED'|'HOMEMADE');if(e.target.value==='FINISHED')setHasSizeVariants(false);}} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="FINISHED">Produit fini</option><option value="HOMEMADE">Fabrication maison</option></select></label>
        {productType==='HOMEMADE'&&<label className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><input type="checkbox" checked={hasSizeVariants} onChange={e=>setHasSizeVariants(e.target.checked)} className="h-4 w-4"/>Proposer les formats Simple et Double (Double = 2 portions)</label>}
        <button disabled={saving} className="sm:col-span-2 lg:col-span-4 min-h-11 rounded-xl bg-[#0F294A] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Créer le produit</button>
      </form>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2"><Factory className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-slate-900">Catalogue des produits</h2></div>
      {loading?<p className="text-sm text-slate-500">Chargement…</p>:<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{products.map(p=><article key={p.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900">{p.name}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${p.product_type==='HOMEMADE'?'bg-violet-100 text-violet-700':'bg-slate-100 text-slate-600'}`}>{p.product_type==='HOMEMADE'?'Fabrication maison':'Produit fini'}</span></div><p className="mt-2 text-sm font-semibold text-slate-700">{formatAriary(p.price)}</p><label className="mt-3 block text-[11px] font-semibold text-slate-500">Type<select value={p.product_type} onChange={e=>void changeProductType(p,e.target.value as 'FINISHED'|'HOMEMADE')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"><option value="FINISHED">Produit fini</option><option value="HOMEMADE">Fabrication maison</option></select></label>{p.product_type==='HOMEMADE'&&<label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={!!p.has_size_variants} onChange={e=>void changeSizeVariants(p,e.target.checked)}/>Formats Simple / Double (Double = 2 portions)</label>}</article>)}</div>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-slate-900">Nouvelle fabrication maison</h2></div>
      {homemade.length===0?<p className="text-sm text-slate-500">Crée d’abord un produit de type « Fabrication maison ».</p>:<form onSubmit={startBatch} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">Produit<select required value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">{homemade.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Date de fabrication<input required type="date" value={producedAt} onChange={e=>setProducedAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"/></label>
        </div>
        <div className="space-y-3">{ingredients.map((i,index)=><div key={i.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex items-center justify-between"><strong className="text-sm text-slate-800">Ingrédient {index+1}</strong>{ingredients.length>1&&<button type="button" onClick={()=>setIngredients(prev=>prev.filter(x=>x.key!==i.key))} className="text-xs font-semibold text-red-600">Supprimer</button>}</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <label className="col-span-2 lg:col-span-1 text-[11px] font-semibold text-slate-600">Nom<input required value={i.name} onChange={e=>updateIngredient(i.key,{name:e.target.value})} placeholder="Sucre" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"/></label>
            <label className="text-[11px] font-semibold text-slate-600">Quantité achetée<input required type="number" min="0.001" step="any" value={i.purchase_quantity} onChange={e=>updateIngredient(i.key,{purchase_quantity:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"/></label>
            <label className="text-[11px] font-semibold text-slate-600">Unité<input required value={i.purchase_unit} onChange={e=>updateIngredient(i.key,{purchase_unit:e.target.value,used_unit:e.target.value})} placeholder="kg, L, pièce" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"/></label>
            <label className="text-[11px] font-semibold text-slate-600">Prix d'achat total (Ar)<input required type="number" min="0.01" step="any" value={i.purchase_price||''} onChange={e=>updateIngredient(i.key,{purchase_price:Number(e.target.value)})} placeholder="6000" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"/></label>
            <label className="text-[11px] font-semibold text-slate-600">Quantité utilisée<input required type="number" min="0.001" step="any" value={i.used_quantity} onChange={e=>updateIngredient(i.key,{used_quantity:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"/></label>
            <div className="flex items-end rounded-lg bg-white px-3 py-2 text-xs text-slate-600">Coût utilisé : <strong className="ml-1 text-slate-900">{formatAriary(i.purchase_quantity>0?Math.round(i.used_quantity/i.purchase_quantity*i.purchase_price):0)}</strong></div>
          </div>
        </div>)}</div>
        <button type="button" onClick={()=>setIngredients(prev=>[...prev,blankIngredient(Date.now())])} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4"/>Ajouter un ingrédient</button>
        <div className="flex flex-col gap-1 rounded-xl bg-blue-50 p-4"><span className="text-xs font-semibold text-blue-800">Coût total calculé</span><strong className="text-2xl text-blue-950">{formatAriary(estimatedCost)}</strong><span className="text-xs text-blue-800">Le nombre de produits fabriqués est facultatif.</span></div>
        <button disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F294A] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Enregistrer la fabrication</button>
      </form>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-slate-900">Fabrications en cours</h2></div>
      {activeBatches.length===0?<p className="text-sm text-slate-500">Aucune fabrication en cours.</p>:activeBatches.map(b=><article key={b.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-slate-900">{b.product_name}</strong><p className="text-xs text-slate-600">Début : {new Date(b.produced_at).toLocaleDateString('fr-FR')} · {b.ingredients.length} ingrédient(s)</p><p className="mt-1 text-sm font-semibold text-slate-800">Coût : {formatAriary(b.total_cost)}</p><p className="text-xs text-slate-600">Portions équivalentes vendues : <strong>{b.sold_quantity??0}</strong> · Chiffre d’affaires : <strong>{formatAriary(b.revenue??0)}</strong></p></div><button disabled={saving} onClick={()=>void closeBatch(b)} className="min-h-10 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Stock épuisé</button></div></article>)}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600"/><h2 className="font-bold text-slate-900">Historique des fabrications</h2></div>
      {closedBatches.length===0?<p className="text-sm text-slate-500">Aucune fabrication clôturée pour le moment.</p>:<div className="space-y-3">{closedBatches.map(b=><article key={b.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong className="text-sm text-slate-900">{b.product_name}</strong><p className="text-xs text-slate-500">{new Date(b.produced_at).toLocaleDateString('fr-FR')} · clôturée le {b.closed_at?new Date(b.closed_at).toLocaleDateString('fr-FR'):'—'}</p></div><strong className={`text-sm ${(b.profit??0)>=0?'text-emerald-700':'text-red-700'}`}>Bénéfice : {formatAriary(b.profit??0)}</strong></div><div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Coût ingrédients</span><p className="font-bold">{formatAriary(b.total_cost)}</p></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Portions équivalentes</span><p className="font-bold">{b.sold_quantity??0}</p></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Chiffre d'affaires</span><p className="font-bold">{formatAriary(b.revenue??0)}</p></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Ingrédients</span><p className="font-bold">{b.ingredients.length}</p></div></div><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-blue-700">Voir les ingrédients</summary><ul className="mt-2 space-y-1 text-xs text-slate-600">{b.ingredients.map(i=><li key={i.id} className="flex justify-between gap-2"><span>{i.name} · {i.used_quantity} {i.used_unit}</span><strong>{formatAriary(i.used_cost)}</strong></li>)}</ul></details></article>)}</div>}
    </section>
  </div>;
};
