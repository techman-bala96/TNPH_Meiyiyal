-- Phone sign-ups stored Auth's phone without the '+' ("919000000001"), so the profile form showed 12 digits
-- and refused to save ("enter a valid 10-digit number"). Store E.164 (+91…) like the profile form does.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email, phone_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    CASE WHEN COALESCE(NEW.phone, '') = '' THEN NULL WHEN NEW.phone LIKE '+%' THEN NEW.phone ELSE '+' || NEW.phone END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.profiles SET phone_number = '+' || phone_number WHERE phone_number ~ '^[1-9][0-9]{9,14}$' AND length(phone_number) > 10;
UPDATE public.profiles SET phone_number = NULL WHERE phone_number = '';
