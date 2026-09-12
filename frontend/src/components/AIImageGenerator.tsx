import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { Image, Loader2, Download, Sparkles, Wand2, RotateCcw } from 'lucide-react';

interface GeneratedImage {
  url: string;
  prompt: string;
  timestamp: Date;
  preset?: string;
}

const PRESET_LABELS: Record<string, string> = {
  banner_hero: '🖼️ Bannière principale',
  social_post: '📱 Post réseaux sociaux',
  flyer_promo: '📄 Flyer promotionnel',
  driver_recruit: '👨‍✈️ Recrutement chauffeurs',
  eco_campaign: '🌿 Campagne écologique',
};

const SIZE_OPTIONS = [
  { value: '1024x1024', label: 'Carré (1024×1024)' },
  { value: '1792x1024', label: 'Paysage (1792×1024)' },
  { value: '1024x1792', label: 'Portrait (1024×1792)' },
];

export default function AIImageGenerator() {
  const { toast } = useToast();
  const [preset, setPreset] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const generateImage = async () => {
    if (!preset && !customPrompt.trim()) {
      toast({ title: 'Erreur', description: 'Choisissez un preset ou saisissez un prompt', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/ai-images/generate',
        method: 'POST',
        data: {
          prompt: customPrompt || preset,
          preset: preset || undefined,
          size,
          quality: 'standard',
        },
        options: { timeout: 600000 },
      });

      const imageUrl = response.data.image_url;
      if (!imageUrl) {
        toast({ title: 'Erreur', description: 'Aucune image générée', variant: 'destructive' });
        return;
      }

      const newImage: GeneratedImage = {
        url: imageUrl,
        prompt: response.data.prompt_used,
        timestamp: new Date(),
        preset: preset || undefined,
      };

      setGallery(prev => [newImage, ...prev]);
      setSelectedImage(newImage);
      toast({ title: '✨ Image générée', description: 'Votre visuel est prêt !' });
    } catch (error: any) {
      const errMsg = error?.response?.data?.detail || error?.data?.detail || error?.message || 'Erreur de génération';
      toast({ title: 'Erreur', description: errMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Generator */}
      <Card className="border-[#C9A227]/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wand2 className="w-5 h-5 text-[#C9A227]" />
            Générateur d'images IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Modèle prédéfini</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(PRESET_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setPreset(key); setCustomPrompt(''); }}
                  className={`p-3 rounded-lg border text-left text-sm transition-all ${
                    preset === key
                      ? 'border-[#C9A227] bg-[#C9A227]/10 text-[#C9A227] font-medium'
                      : 'border-gray-200 hover:border-[#1F4E5F]/30 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom prompt */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ou décrivez votre visuel</Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => { setCustomPrompt(e.target.value); if (e.target.value) setPreset(''); }}
              placeholder="Ex: Un véhicule électrique EDEN VTC devant le monument de la Réunification à Douala..."
              className="min-h-[80px] text-sm"
            />
          </div>

          {/* Size */}
          <div className="flex items-center gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm">Format</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-6">
              <Button
                onClick={generateImage}
                disabled={loading || (!preset && !customPrompt.trim())}
                className="bg-gradient-to-r from-[#C9A227] to-[#d4b03a] hover:from-[#b8921f] hover:to-[#c9a227] text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Générer
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected image preview */}
      {selectedImage && (
        <Card className="border-[#1F4E5F]/20">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {selectedImage.preset ? PRESET_LABELS[selectedImage.preset] : 'Personnalisé'}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadImage(selectedImage.url, `eden-vtc-${Date.now()}.png`)}
                  className="h-7 text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Télécharger
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={selectedImage.url}
                  alt="Image générée"
                  className="w-full h-auto max-h-[400px] object-contain bg-gray-50"
                />
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{selectedImage.prompt}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gallery */}
      {gallery.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Image className="w-4 h-4" />
              Galerie ({gallery.length} images)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(img)}
                  className={`rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                    selectedImage === img ? 'border-[#C9A227]' : 'border-transparent'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={`Généré ${i + 1}`}
                    className="w-full h-24 object-cover"
                  />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}