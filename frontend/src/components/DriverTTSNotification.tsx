import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { Volume2, VolumeX, Play, Pause, Loader2, Mic } from 'lucide-react';

interface RideNotification {
  pickup_address: string;
  destination_address: string;
  passenger_name?: string;
  estimated_price?: number;
  distance_km?: number;
}

export default function DriverTTSNotification() {
  const { toast } = useToast();
  const [autoPlay, setAutoPlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>('');
  const [notificationText, setNotificationText] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateAndPlay = async (ride: RideNotification) => {
    setIsGenerating(true);
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/tts/ride-notification',
        method: 'POST',
        data: ride,
        options: { timeout: 60000 },
      });

      const audioUrl = response.data.audio_url;
      const text = response.data.text;

      if (!audioUrl) {
        toast({ title: 'Erreur TTS', description: 'Impossible de générer l\'audio', variant: 'destructive' });
        return;
      }

      setCurrentAudioUrl(audioUrl);
      setNotificationText(text);

      if (autoPlay) {
        playAudio(audioUrl);
      }
    } catch (error: any) {
      const errMsg = error?.data?.detail || error?.message || 'Erreur TTS';
      toast({ title: 'Erreur', description: errMsg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const playAudio = (url?: string) => {
    const audioUrl = url || currentAudioUrl;
    if (!audioUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setIsPlaying(true);
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onerror = () => {
      setIsPlaying(false);
      toast({ title: 'Erreur audio', description: 'Impossible de lire l\'audio', variant: 'destructive' });
    };

    audio.play().catch(() => {
      setIsPlaying(false);
    });
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentAudioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  // Demo function to test TTS
  const testTTS = () => {
    generateAndPlay({
      pickup_address: 'Carrefour Ndokoti, Douala',
      destination_address: 'Aéroport International de Douala',
      passenger_name: 'Jean Mbarga',
      estimated_price: 4500,
      distance_km: 12.3,
    });
  };

  return (
    <Card className="border-[#1F4E5F]/20">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#1F4E5F]/10 flex items-center justify-center">
              <Mic className="w-4 h-4 text-[#1F4E5F]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Notifications vocales</h3>
              <p className="text-xs text-gray-500">Annonces TTS des nouvelles courses</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs border-[#1F4E5F]/30 text-[#1F4E5F]">
            IA
          </Badge>
        </div>

        {/* Auto-play toggle */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2">
            {autoPlay ? <Volume2 className="w-4 h-4 text-[#1F4E5F]" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
            <Label htmlFor="autoplay" className="text-sm">Lecture automatique</Label>
          </div>
          <Switch
            id="autoplay"
            checked={autoPlay}
            onCheckedChange={setAutoPlay}
          />
        </div>

        {/* Current notification */}
        {notificationText && (
          <div className="bg-[#1F4E5F]/5 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-600 leading-relaxed">{notificationText}</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={togglePlayPause}
                disabled={!currentAudioUrl}
                className="h-7 text-xs"
              >
                {isPlaying ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                {isPlaying ? 'Pause' : 'Écouter'}
              </Button>
              {isPlaying && (
                <Button size="sm" variant="ghost" onClick={stopAudio} className="h-7 text-xs">
                  Arrêter
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Test button */}
        <Button
          onClick={testTTS}
          disabled={isGenerating}
          variant="outline"
          className="w-full border-[#1F4E5F]/30 text-[#1F4E5F] hover:bg-[#1F4E5F]/10"
          size="sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 mr-2" />
              Tester la notification vocale
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export { DriverTTSNotification };
export type { RideNotification };