import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, MessageCircle, Phone, Check, Users, Link2 } from 'lucide-react';

interface SharePositionProps {
  driverName: string;
  driverPlate: string;
  pickupName: string;
  destinationName: string;
  driverLat: number;
  driverLng: number;
  eta: number;
}

export default function SharePosition({
  driverName,
  driverPlate,
  pickupName,
  destinationName,
  driverLat,
  driverLng,
  eta,
}: SharePositionProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sharedContacts, setSharedContacts] = useState<{ name: string; phone: string; time: string }[]>([]);

  // Generate share message
  const generateShareMessage = () => {
    const mapLink = `https://www.google.com/maps?q=${driverLat},${driverLng}`;
    return `🚗 EDEN VTC - Partage de position\n\n` +
      `Je suis en course avec EDEN VTC :\n` +
      `👤 Chauffeur : ${driverName}\n` +
      `🚘 Plaque : ${driverPlate}\n` +
      `📍 De : ${pickupName}\n` +
      `🏁 Vers : ${destinationName}\n` +
      `⏱️ Arrivée estimée : ${eta} min\n\n` +
      `📌 Position actuelle du véhicule :\n${mapLink}\n\n` +
      `Envoyé via EDEN VTC - Transport 100% électrique`;
  };

  const generateShareLink = () => {
    return `https://www.google.com/maps?q=${driverLat},${driverLng}`;
  };

  // Native Web Share API
  const handleNativeShare = async () => {
    const message = generateShareMessage();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EDEN VTC - Ma position en temps réel',
          text: message,
          url: generateShareLink(),
        });
        toast({ title: 'Position partagée avec succès !' });
        setOpen(false);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          toast({ title: 'Erreur lors du partage', variant: 'destructive' });
        }
      }
    } else {
      // Fallback: copy to clipboard
      handleCopyLink();
    }
  };

  // Share via WhatsApp
  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(generateShareMessage());
    const phone = contactPhone.replace(/\s/g, '').replace('+', '');
    const url = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, '_blank');

    if (contactName) {
      addSharedContact();
    }
    toast({ title: 'Ouverture de WhatsApp...' });
  };

  // Share via SMS
  const handleSMSShare = () => {
    const message = encodeURIComponent(generateShareMessage());
    const phone = contactPhone.replace(/\s/g, '');
    const url = phone
      ? `sms:${phone}?body=${message}`
      : `sms:?body=${message}`;
    window.open(url, '_self');

    if (contactName) {
      addSharedContact();
    }
    toast({ title: 'Ouverture des SMS...' });
  };

  // Copy link
  const handleCopyLink = async () => {
    const message = generateShareMessage();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast({ title: 'Lien copié dans le presse-papier !' });
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      toast({ title: 'Lien copié !' });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Add to shared contacts list
  const addSharedContact = () => {
    if (contactName.trim()) {
      setSharedContacts((prev) => [
        ...prev,
        {
          name: contactName.trim(),
          phone: contactPhone.trim(),
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setContactName('');
      setContactPhone('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-green-700 hover:text-green-800 hover:bg-green-100 h-8 gap-1.5"
        >
          <Share2 className="w-3.5 h-3.5" />
          Partager ma position
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[hsl(195,50%,25%)]" />
            Partager ma position
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Quick share buttons */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Partager rapidement via :</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleNativeShare}
                className="bg-[hsl(195,50%,25%)] hover:bg-[hsl(195,50%,30%)] text-white gap-2"
              >
                <Share2 className="w-4 h-4" />
                Partager
              </Button>
              <Button
                onClick={handleWhatsAppShare}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
              <Button
                onClick={handleSMSShare}
                variant="outline"
                className="gap-2"
              >
                <Phone className="w-4 h-4" />
                SMS
              </Button>
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier'}
              </Button>
            </div>
          </div>

          {/* Share with specific contact */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Envoyer à un contact
            </p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nom du contact</Label>
                <Input
                  placeholder="Ex: Maman, Papa, Ami(e)..."
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Numéro (optionnel)</Label>
                <Input
                  placeholder="+237 6XX XXX XXX"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="h-9"
                  type="tel"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleWhatsAppShare}
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  disabled={!contactName.trim()}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </Button>
                <Button
                  onClick={handleSMSShare}
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  disabled={!contactName.trim()}
                >
                  <Phone className="w-3.5 h-3.5" />
                  SMS
                </Button>
              </div>
            </div>
          </div>

          {/* Shared contacts list */}
          {sharedContacts.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Contacts informés ({sharedContacts.length})
              </p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {sharedContacts.map((contact, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-semibold text-green-700">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{contact.name}</p>
                        {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{contact.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
            <Link2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Le lien partagé contient la position actuelle du véhicule sur Google Maps.
              Vos contacts pourront voir où vous êtes en temps réel pour votre sécurité.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}