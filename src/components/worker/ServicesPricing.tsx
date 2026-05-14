import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, Loader2 } from 'lucide-react';

interface ServiceItem {
  id: string;
  service_name_en: string;
  service_name_ta: string;
  price_min: number;
  price_max: number;
  price_unit_en: string;
  price_unit_ta: string;
}

interface ServicesPricingProps {
  occupationId: string | null;
}

export function ServicesPricing({ occupationId }: ServicesPricingProps) {
  const { t, i18n } = useTranslation();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (occupationId) {
      fetchServices();
    } else {
      setLoading(false);
    }
  }, [occupationId]);

  async function fetchServices() {
    try {
      const { data, error } = await supabase
        .from('occupation_services')
        .select('*')
        .eq('occupation_id', occupationId!)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setServices((data as ServiceItem[]) || []);
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  }

  const isTamil = i18n.language === 'ta';

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (services.length === 0) {
    return null;
  }

  function formatPrice(min: number, max: number) {
    if (min === max) return `₹${min.toLocaleString('en-IN')}`;
    return `₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-primary" />
          {t('worker.services')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {services.map((service) => (
            <div key={service.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium text-sm">
                  {isTamil ? service.service_name_ta : service.service_name_en}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isTamil ? service.price_unit_ta : service.price_unit_en}
                </p>
              </div>
              <Badge variant="secondary" className="font-semibold text-xs">
                {formatPrice(service.price_min, service.price_max)}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
