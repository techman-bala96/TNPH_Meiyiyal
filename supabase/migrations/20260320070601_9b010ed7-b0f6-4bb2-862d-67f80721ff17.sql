
-- Create occupation_services table for storing service prices per occupation
CREATE TABLE public.occupation_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occupation_id uuid REFERENCES public.occupations(id) ON DELETE CASCADE NOT NULL,
  service_name_en text NOT NULL,
  service_name_ta text NOT NULL,
  price_min numeric NOT NULL DEFAULT 0,
  price_max numeric NOT NULL DEFAULT 0,
  price_unit_en text NOT NULL DEFAULT 'per service',
  price_unit_ta text NOT NULL DEFAULT 'சேவைக்கு',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.occupation_services ENABLE ROW LEVEL SECURITY;

-- Everyone can view services
CREATE POLICY "Services are viewable by everyone"
ON public.occupation_services
FOR SELECT
USING (true);

-- Also add Tamil name columns to occupations table
ALTER TABLE public.occupations ADD COLUMN IF NOT EXISTS name_ta text;
ALTER TABLE public.occupations ADD COLUMN IF NOT EXISTS description_ta text;
