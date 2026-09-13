import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useEmergencyContact } from '@/hooks/useEmergencyContact';
import { client } from '@/lib/client';
import { AlertTriangle, CheckCircle2, Loader2, Siren } from 'lucide-react';

interface SosButtonProps {
  rideId: number;
  driverName: string;
  driverPlate: string;
  pickupName: string;
  destinationName: string;
  currentLat: number;
  currentLng: number;
}

type Step = 'setup_contact' | 'confirm' | 'sending' | 'sent';

/**
 * Bouton SOS : troisième pilier de la trilogie sécurité (Trust Score avant
 * la course, veille anti-déviation pendant, SOS en cas d'urgence). Toujours
 * accessible pendant le suivi, pas seulement déclenché automatiquement —
 * une fausse alerte auto-déclenchée serait pire que l'absence de fonction.
 */
export default function SosButton({
  rideId,
  driverName,
  driverPlate,
  pickupName,
  destinationName,
  currentLat,
  currentLng,
}: SosButtonProps) {
  const { toast } = useToast();
  const { contact, loading: contactLoading, save } = useEmergencyContact();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('confirm');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  const openDialog = () => {
    setStep(contact?.phone ? 'confirm' : 'setup_contact');
    setOpen(true);
  };

  const handleSaveContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    setSavingContact(true);
    try {
      await save(contactName.trim(), contactPhone.trim());
      setStep('confirm');
    } catch (e) {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer le contact.", variant: 'destructive' });
    }
    setSavingContact(false);
  };

  const shareWithContact = (phone: string) => {
    const mapLink = `https://www.google.com/maps?q=${currentLat},${currentLng}`;
    const message = encodeURIComponent(
      `🆘 ALERTE URGENCE EDEN VTC\n\n` +
      `Je suis en course et j'ai besoin d'aide.\n` +
      `👤 Chauffeur : ${driverName} (${driverPlate})\n` +
      `📍 De : ${pickupName}\n🏁 Vers : ${destinationName}\n\n` +
      `📌 Ma position actuelle :\n${mapLink}`
    );
    const cleanPhone = phone.replace(/\s/g, '');
    window.open(`https://wa.me/${cleanPhone.replace('+', '')}?text=${message}`, '_blank');
  };

  const handleConfirmSos = async () => {
    setStep('sending');
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/safety/sos',
        method: 'POST',
        data: { ride_id: rideId, latitude: currentLat, longitude: currentLng },
      });
      if (res?.data?.success) {
        const ec = res.data.emergency_contact;
        if (ec?.phone) {
          shareWithContact(ec.phone);
        }
        setStep('sent');
      } else {
        throw new Error('unexpected response');
      }
    } catch (err) {
      const errAny = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = errAny?.response?.data?.detail;
      toast({
        title: "❌ L'alerte n'a pas pu être envoyée",
        description: detail || errAny?.message || 'Réessayez, ou appelez directement votre contact.',
        variant: 'destructive',
      });
      setStep('confirm');
    }
  };

  return (
    <>
      <button
        onClick={openDialog}
        className="fixed bottom-24 right-4 z-[1000] w-14 h-14 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
        aria-label="Bouton SOS"
      >
        <Siren className="w-6 h-6" />
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (step !== 'sending') setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Alerte SOS
            </DialogTitle>
          </DialogHeader>

          {step === 'setup_contact' && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-muted-foreground">
                Ajoutez un contact de confiance : en cas d'alerte, sa position et votre trajet lui seront partagés immédiatement par WhatsApp.
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Nom du contact</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ex: Maman" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Numéro WhatsApp</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+237 6XX XXX XXX" type="tel" className="h-9" />
                </div>
              </div>
              <Button
                onClick={handleSaveContact}
                disabled={!contactName.trim() || !contactPhone.trim() || savingContact}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {savingContact ? 'Enregistrement...' : 'Enregistrer et continuer'}
              </Button>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep('confirm')}>
                Continuer sans contact de confiance
              </Button>
            </div>
          )}

          {step === 'confirm' && !contactLoading && (
            <div className="space-y-4 py-1">
              <p className="text-sm">
                Vous êtes sur le point de déclencher une alerte SOS pour cette course.
                {contact?.phone ? (
                  <> Votre position et votre trajet seront immédiatement partagés avec <strong>{contact.name}</strong> par WhatsApp.</>
                ) : (
                  <> Aucun contact de confiance n'est enregistré — l'alerte sera tout de même journalisée par EDEN VTC.</>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                En cas de danger immédiat, contactez également les services d'urgence de votre pays.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Annuler</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5" onClick={handleConfirmSos}>
                  <Siren className="w-4 h-4" />
                  Confirmer l'alerte
                </Button>
              </div>
              {!contact?.phone && (
                <Button variant="link" className="w-full text-xs h-auto p-0" onClick={() => setStep('setup_contact')}>
                  Ajouter un contact de confiance d'abord
                </Button>
              )}
            </div>
          )}

          {step === 'sending' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
              <p className="text-sm text-muted-foreground">Envoi de l'alerte...</p>
            </div>
          )}

          {step === 'sent' && (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
              <p className="font-semibold">Alerte envoyée</p>
              <p className="text-sm text-muted-foreground">
                {contact?.phone
                  ? `Votre position a été partagée avec ${contact.name} par WhatsApp. Restez en sécurité.`
                  : "Votre alerte a été enregistrée par EDEN VTC. Restez en sécurité."}
              </p>
              <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
