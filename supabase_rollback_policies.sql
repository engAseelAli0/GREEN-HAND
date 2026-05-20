-- =========================================================================
-- ملف استعادة السياسات القديمة (Rollback Script)
-- قم بتشغيل هذا الكود في SQL Editor الخاص بـ Supabase فقط إذا حدث خطأ في النظام
-- وتريد إعادة صلاحيات الجداول إلى ما كانت عليه سابقاً.
-- =========================================================================

-- 1. إزالة جميع السياسات الجديدة المؤمنة لمنع التعارض
DROP POLICY IF EXISTS "Admin full access" ON public.system_users;
DROP POLICY IF EXISTS "User read own data" ON public.system_users;
DROP POLICY IF EXISTS "Allow authenticated read lookup_settings" ON public.lookup_settings;
DROP POLICY IF EXISTS "Admin write lookup_settings" ON public.lookup_settings;
DROP POLICY IF EXISTS "Allow authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated delete orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated read receivings" ON public.receivings;
DROP POLICY IF EXISTS "Allow authenticated write receivings" ON public.receivings;
DROP POLICY IF EXISTS "Enable all actions for authenticated users" ON public.receivings;

-- 2. إيقاف الـ RLS مؤقتاً لجدول الاستلامات ليعود مفتوحاً للجميع كما كان
ALTER TABLE public.receivings DISABLE ROW LEVEL SECURITY;

-- 3. إعادة بناء السياسات القديمة الافتراضية
-- جدول system_users
CREATE POLICY "Admin full access" ON public.system_users FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
    (auth.jwt() -> 'user_metadata' ->> 'username') = 'admin' OR
    (auth.jwt() ->> 'email') = 'admin@greenhand.local'
);

CREATE POLICY "User read own data" ON public.system_users FOR SELECT USING (
    username = (auth.jwt() -> 'user_metadata' ->> 'username')
);

-- جدول lookup_settings
CREATE POLICY "Allow authenticated full access to lookup_settings" 
ON public.lookup_settings 
FOR ALL 
TO authenticated 
USING (true);

-- جدول orders
CREATE POLICY "Allow authenticated full access to orders" 
ON public.orders 
FOR ALL 
TO authenticated 
USING (true);

-- جدول receivings (إعطاء صلاحية كاملة للجميع)
CREATE POLICY "Enable all actions for authenticated users" 
ON public.receivings 
FOR ALL 
TO public 
USING (true);
