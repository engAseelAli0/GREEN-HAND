-- 1. وظيفة (RPC) لقراءة بيانات المستخدم قبل تسجيل الدخول بأمان متجاوزة الـ RLS
CREATE OR REPLACE FUNCTION get_user_prelogin_info(lookup_username text)
RETURNS TABLE (id uuid, permissions jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, permissions 
  FROM system_users 
  WHERE username = lookup_username 
  LIMIT 1;
$$;

-- 2. إزالة عمود كلمات المرور من الجداول (لحماية البيانات المتبقية)
ALTER TABLE public.system_users DROP COLUMN IF EXISTS password;

-- 3. تفعيل RLS على جداول النظام (system_users, lookup_settings, orders)
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 4. إزالة السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Admin full access" ON public.system_users;
DROP POLICY IF EXISTS "User read own data" ON public.system_users;

-- 5. سياسات جدول system_users
-- سياسة الإدارة: الإدمن له كامل الصلاحيات
CREATE POLICY "Admin full access" ON public.system_users FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
    (auth.jwt() -> 'user_metadata' ->> 'username') = 'admin' OR
    (auth.jwt() ->> 'email') = 'admin@greenhand.local'
);

-- سياسة المستخدم العادي: يمكنه قراءة بياناته الخاصة فقط (تحتاجها الواجهة بعد تسجيل الدخول)
CREATE POLICY "User read own data" ON public.system_users FOR SELECT USING (
    username = (auth.jwt() -> 'user_metadata' ->> 'username')
);

-- 6. سياسات جدول lookup_settings و orders (مفتوحة للمسجلين فقط ومغلقة عن العامة)
CREATE POLICY "Allow authenticated full access to lookup_settings" 
ON public.lookup_settings 
FOR ALL 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated full access to orders" 
ON public.orders 
FOR ALL 
TO authenticated 
USING (true);
