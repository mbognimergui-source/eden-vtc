import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, ShieldAlert, Lock, Eye, Server, Globe, Key } from 'lucide-react';
import { t } from '@/lib/i18n';

interface SecurityCheck {
  name: string;
  status: 'active' | 'warning' | 'inactive';
  description: string;
  category: string;
}

const securityChecks: SecurityCheck[] = [
  {
    name: 'Authentification téléphone + code SMS (OTP)',
    status: 'active',
    description: 'Code à 6 chiffres envoyé par SMS, valable 5 minutes, à usage unique',
    category: 'auth',
  },
  {
    name: 'Tokens JWT signés',
    status: 'active',
    description: 'Tokens d\'accès signés avec expiration automatique',
    category: 'auth',
  },
  {
    name: 'Rate Limiting',
    status: 'active',
    description: '100 req/min par IP, 10 req/min pour l\'authentification',
    category: 'network',
  },
  {
    name: 'Protection XSS',
    status: 'active',
    description: 'Sanitisation des entrées et headers X-XSS-Protection',
    category: 'injection',
  },
  {
    name: 'Protection SQL Injection',
    status: 'active',
    description: 'ORM SQLAlchemy avec requêtes paramétrées',
    category: 'injection',
  },
  {
    name: 'Headers de sécurité HTTP',
    status: 'active',
    description: 'HSTS, CSP, X-Frame-Options, X-Content-Type-Options',
    category: 'network',
  },
  {
    name: 'Protection CSRF',
    status: 'active',
    description: 'Tokens CSRF pour les formulaires sensibles',
    category: 'auth',
  },
  {
    name: 'Détection d\'intrusion',
    status: 'active',
    description: 'Blocage automatique des IP suspectes (path traversal, injections)',
    category: 'network',
  },
  {
    name: 'Chiffrement HTTPS',
    status: 'active',
    description: 'Toutes les communications sont chiffrées via TLS/SSL',
    category: 'network',
  },
  {
    name: 'Validation des fichiers',
    status: 'active',
    description: 'Vérification du type, taille et nom des fichiers uploadés',
    category: 'injection',
  },
  {
    name: 'Protection Clickjacking',
    status: 'active',
    description: 'X-Frame-Options: DENY empêche l\'intégration en iframe',
    category: 'network',
  },
  {
    name: 'Contrôle d\'accès RBAC',
    status: 'active',
    description: 'Rôles (passager/chauffeur/admin) avec permissions granulaires',
    category: 'auth',
  },
];

const categoryIcons: Record<string, typeof Shield> = {
  auth: Key,
  network: Globe,
  injection: ShieldAlert,
};

const categoryLabels: Record<string, string> = {
  auth: 'Authentification & Accès',
  network: 'Réseau & Transport',
  injection: 'Protection Injections',
};

export default function SecurityPanel() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredChecks = selectedCategory
    ? securityChecks.filter((c) => c.category === selectedCategory)
    : securityChecks;

  const activeCount = securityChecks.filter((c) => c.status === 'active').length;
  const totalCount = securityChecks.length;
  const score = Math.round((activeCount / totalCount) * 100);

  const categories = [...new Set(securityChecks.map((c) => c.category))];

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-green-700">{score}%</h3>
              <p className="text-sm text-green-600">
                Score de sécurité — {activeCount}/{totalCount} protections actives
              </p>
            </div>
            <Badge className="ml-auto bg-green-600 text-white text-sm px-3 py-1">
              <Lock className="w-3 h-3 mr-1" />
              Sécurisé
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            !selectedCategory
              ? 'bg-[hsl(195,50%,25%)] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tout ({totalCount})
        </button>
        {categories.map((cat) => {
          const Icon = categoryIcons[cat] || Shield;
          const count = securityChecks.filter((c) => c.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${
                selectedCategory === cat
                  ? 'bg-[hsl(195,50%,25%)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              {categoryLabels[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Security Checks Grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {filteredChecks.map((check, index) => (
          <Card key={index} className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm text-gray-900">{check.name}</h4>
                    <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                      Actif
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{check.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Bonnes pratiques appliquées
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-xs text-gray-600">
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Les mots de passe et tokens ne sont jamais stockés en clair</span>
            </li>
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Les logs ne contiennent aucune donnée personnelle (IPs hashées)</span>
            </li>
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Les sessions expirent automatiquement après inactivité</span>
            </li>
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Les requêtes API sont validées et sanitisées côté serveur</span>
            </li>
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Isolation des données par utilisateur (Row Level Security)</span>
            </li>
            <li className="flex items-start gap-2">
              <Server className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Protection contre les attaques par force brute (blocage après tentatives excessives)</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}