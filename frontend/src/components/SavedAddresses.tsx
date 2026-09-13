import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { Star, Home, Briefcase, Heart, MapPin, Plus, Trash2, Navigation, Bookmark } from 'lucide-react';

export interface SavedAddress {
  id: number;
  label: string;
  address: string;
  lat: number;
  lng: number;
  icon: string;
  is_default: boolean;
  use_count: number;
}

interface SavedAddressesProps {
  onSelect: (address: SavedAddress) => void;
  compact?: boolean;
}

const ICON_OPTIONS = [
  { value: 'home', label: 'Maison', icon: Home },
  { value: 'work', label: 'Bureau', icon: Briefcase },
  { value: 'star', label: 'Favori', icon: Star },
  { value: 'heart', label: 'Famille', icon: Heart },
  { value: 'pin', label: 'Autre', icon: MapPin },
];

function getIconComponent(iconName: string) {
  const found = ICON_OPTIONS.find(o => o.value === iconName);
  return found ? found.icon : MapPin;
}

export default function SavedAddresses({ onSelect, compact = false }: SavedAddressesProps) {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newIcon, setNewIcon] = useState('star');
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    try {
      const res = await client.entities.saved_addresses.query({
        query: {},
        sort: '-use_count',
        limit: 20,
      });
      if (res?.data?.items) {
        setAddresses(res.data.items);
      }
    } catch {
      // Not logged in or no addresses yet
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleAdd = async () => {
    if (!newLabel.trim() || !newAddress.trim()) {
      toast({ title: 'Veuillez remplir le label et l\'adresse', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Geocode the address to get coordinates
      let lat = 4.0511, lng = 9.7679; // Default Douala
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(newAddress)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'EDEN-VTC-App/1.0' } }
        );
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lng = parseFloat(geoData[0].lon);
        }
      } catch {
        // Use default coords if geocoding fails
      }

      await client.entities.saved_addresses.create({
        data: {
          label: newLabel.trim(),
          address: newAddress.trim(),
          lat,
          lng,
          icon: newIcon,
          is_default: addresses.length === 0,
          use_count: 0,
        },
      });

      toast({ title: `✅ Adresse "${newLabel}" sauvegardée` });
      setNewLabel('');
      setNewAddress('');
      setNewIcon('star');
      setShowAddDialog(false);
      loadAddresses();
    } catch (e: any) {
      toast({ title: 'Erreur lors de la sauvegarde', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, label: string) => {
    try {
      await client.entities.saved_addresses.delete({ id });
      toast({ title: `🗑️ Adresse "${label}" supprimée` });
      setAddresses(prev => prev.filter(a => a.id !== id));
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    }
  };

  const handleSelect = async (addr: SavedAddress) => {
    onSelect(addr);
    // Increment use count in background
    try {
      await client.entities.saved_addresses.update({
        id: addr.id,
        data: { use_count: (addr.use_count || 0) + 1 },
      });
    } catch {
      // Non-critical
    }
  };

  // Compact mode is always the terminal case, chargement compris : on
  // n'affiche jamais le panneau complet ("Aucune adresse sauvegardée...")
  // à sa place, ce qui décalerait tout ce qui suit (notamment le champ de
  // saisie manuelle juste à côté). Pendant le chargement, `addresses` est
  // simplement encore vide : seul le bouton "+" est visible, sans saut de
  // mise en page une fois les adresses chargées.
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {addresses.slice(0, 4).map((addr) => {
          const IconComp = getIconComponent(addr.icon);
          return (
            <Button
              key={addr.id}
              variant="outline"
              size="sm"
              onClick={() => handleSelect(addr)}
              className="text-xs h-7 px-2 gap-1 border-[hsl(45,65%,47%)]/30 hover:bg-[hsl(45,65%,47%)]/10 hover:border-[hsl(45,65%,47%)]"
              title={addr.address}
            >
              <IconComp className="w-3 h-3 text-[hsl(45,65%,47%)]" />
              {addr.label}
            </Button>
          );
        })}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1 text-muted-foreground hover:text-[hsl(195,50%,25%)]">
              <Plus className="w-3 h-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-[hsl(45,65%,47%)]" />
                Ajouter une adresse favorite
              </DialogTitle>
            </DialogHeader>
            <AddAddressForm
              newLabel={newLabel}
              setNewLabel={setNewLabel}
              newAddress={newAddress}
              setNewAddress={setNewAddress}
              newIcon={newIcon}
              setNewIcon={setNewIcon}
              saving={saving}
              onSave={handleAdd}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (loading) {
    return null; // Mode complet uniquement : rien à afficher pendant le chargement.
  }

  // Full mode: show list with management options
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Bookmark className="w-4 h-4 text-[hsl(45,65%,47%)]" />
          Adresses favorites
        </Label>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />
              Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-[hsl(45,65%,47%)]" />
                Ajouter une adresse favorite
              </DialogTitle>
            </DialogHeader>
            <AddAddressForm
              newLabel={newLabel}
              setNewLabel={setNewLabel}
              newAddress={newAddress}
              setNewAddress={setNewAddress}
              newIcon={newIcon}
              setNewIcon={setNewIcon}
              saving={saving}
              onSave={handleAdd}
            />
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Aucune adresse sauvegardée. Ajoutez vos lieux fréquents pour un accès rapide.
        </p>
      ) : (
        <div className="grid gap-2">
          {addresses.map((addr) => {
            const IconComp = getIconComponent(addr.icon);
            return (
              <div
                key={addr.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-border/50 hover:border-[hsl(45,65%,47%)]/50 hover:bg-[hsl(45,65%,47%)]/5 transition-colors cursor-pointer group"
                onClick={() => handleSelect(addr)}
              >
                <div className="w-8 h-8 rounded-full bg-[hsl(45,65%,47%)]/10 flex items-center justify-center shrink-0">
                  <IconComp className="w-4 h-4 text-[hsl(45,65%,47%)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{addr.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{addr.address}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Navigation className="w-3 h-3 text-[hsl(195,50%,25%)]" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={(e) => { e.stopPropagation(); handleDelete(addr.id, addr.label); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-component for the add address form
function AddAddressForm({
  newLabel, setNewLabel, newAddress, setNewAddress, newIcon, setNewIcon, saving, onSave,
}: {
  newLabel: string;
  setNewLabel: (v: string) => void;
  newAddress: string;
  setNewAddress: (v: string) => void;
  newIcon: string;
  setNewIcon: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Nom du lieu</Label>
        <Input
          placeholder="Ex: Maison, Bureau, Maman..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Adresse complète</Label>
        <Input
          placeholder="Ex: Rue de la Joie, Akwa, Douala"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Icône</Label>
        <Select value={newIcon} onValueChange={setNewIcon}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <Button
        onClick={onSave}
        disabled={saving || !newLabel.trim() || !newAddress.trim()}
        className="w-full bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white"
      >
        {saving ? 'Enregistrement...' : '💾 Sauvegarder l\'adresse'}
      </Button>
    </div>
  );
}