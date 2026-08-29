import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  Gauge, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Navigation,
  Info,
} from 'lucide-react';
import { TrafficSummary } from '@/hooks/useTrafficData';

interface TrafficPanelProps {
  trafficData: TrafficSummary | null;
  loading: boolean;
  lastUpdate: Date | null;
  onRefresh: () => void;
  compact?: boolean;
}

const levelConfig = {
  low: {
    label: 'Fluide',
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '🟢',
  },
  moderate: {
    label: 'Modéré',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: '🟡',
  },
  heavy: {
    label: 'Dense',
    color: 'bg-orange-500',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '🟠',
  },
  severe: {
    label: 'Très dense',
    color: 'bg-red-500',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '🔴',
  },
};

export default function TrafficPanel({ trafficData, loading, lastUpdate, onRefresh, compact = false }: TrafficPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!trafficData) {
    return (
      <Card className="border-dashed border-gray-300">
        <CardContent className="p-3 flex items-center justify-center gap-2 text-sm text-gray-500">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Chargement des données trafic...</span>
        </CardContent>
      </Card>
    );
  }

  const config = levelConfig[trafficData.overallLevel];

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
        <span className="text-sm">{config.icon}</span>
        <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
        {trafficData.totalDelay > 0 && (
          <span className="text-xs text-gray-600">+{trafficData.totalDelay} min</span>
        )}
      </div>
    );
  }

  return (
    <Card className={`${config.borderColor} border overflow-hidden`}>
      {/* Header */}
      <div className={`${config.bgColor} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-semibold ${config.textColor}`}>
                Trafic : {config.label}
              </h3>
              <Badge variant="outline" className={`text-[10px] ${config.textColor} ${config.borderColor}`}>
                {trafficData.peakHours}
              </Badge>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">{trafficData.recommendation}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats */}
      <CardContent className="p-3">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#1F4E5F]" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Vitesse moy.</p>
              <p className="text-sm font-semibold text-[#1F4E5F]">{trafficData.averageSpeed} km/h</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#1F4E5F]" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Retard max</p>
              <p className="text-sm font-semibold text-[#1F4E5F]">
                {trafficData.totalDelay > 0 ? `+${trafficData.totalDelay} min` : '0 min'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#1F4E5F]" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Zones</p>
              <p className="text-sm font-semibold text-[#1F4E5F]">
                {trafficData.segments.filter(s => s.level === 'heavy' || s.level === 'severe').length} critiques
              </p>
            </div>
          </div>
        </div>

        {/* Expand/Collapse segments */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full h-7 text-xs text-gray-500 hover:text-[#1F4E5F]"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              Masquer les détails
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              Voir les axes ({trafficData.segments.length})
            </>
          )}
        </Button>

        {/* Segment details */}
        {expanded && (
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {trafficData.segments
              .sort((a, b) => {
                const order = { severe: 0, heavy: 1, moderate: 2, low: 3 };
                return order[a.level] - order[b.level];
              })
              .map((segment) => {
                const segConfig = levelConfig[segment.level];
                return (
                  <div
                    key={segment.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md ${segConfig.bgColor} border ${segConfig.borderColor}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Navigation className={`w-3 h-3 flex-shrink-0 ${segConfig.textColor}`} />
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {segment.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-500">{segment.speed} km/h</span>
                      {segment.delay > 0 && (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${segConfig.textColor}`}>
                          +{segment.delay} min
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Last update */}
        {lastUpdate && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
            <Info className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] text-gray-400">
              Mis à jour à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}