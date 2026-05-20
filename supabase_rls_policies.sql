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

-- 3. تفعيل RLS على جداول النظام (system_users, lookup_settings, orders, receivings)
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivings ENABLE ROW LEVEL SECURITY;

-- 4. إزالة السياسات القديمة بالكامل لتجنب التضارب
DROP POLICY IF EXISTS "Admin full access" ON public.system_users;
DROP POLICY IF EXISTS "User read own data" ON public.system_users;
DROP POLICY IF EXISTS "Allow authenticated full access to lookup_settings" ON public.lookup_settings;
DROP POLICY IF EXISTS "Allow authenticated read lookup_settings" ON public.lookup_settings;
DROP POLICY IF EXISTS "Admin write lookup_settings" ON public.lookup_settings;
DROP POLICY IF EXISTS "Allow authenticated full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated delete orders" ON public.orders;
DROP POLICY IF EXISTS "Enable all actions for authenticated users" ON public.receivings;
DROP POLICY IF EXISTS "Allow authenticated read receivings" ON public.receivings;
DROP POLICY IF EXISTS "Allow authenticated write receivings" ON public.receivings;

-- =========================================================================
-- 5. سياسات جدول system_users (إدارة المستخدمين والصلاحيات)
-- =========================================================================

-- سياسة الإدارة: الأدمن له كامل الصلاحيات (قراءة، كتابة، تعديل، حذف)
-- تم قصرها على الأدمن الموثقين فقط وليس العوام (TO authenticated)
CREATE POLICY "Admin full access" ON public.system_users FOR ALL TO authenticated USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
    (auth.jwt() -> 'user_metadata' ->> 'username') = 'admin' OR
    (auth.jwt() ->> 'email') = 'admin@greenhand.local'
);

-- سياسة المستخدم العادي: يمكنه قراءة بياناته الخاصة فقط (تحتاجها الواجهة بعد تسجيل الدخول)
-- تم حصرها بالمستخدم الموثق فقط (TO authenticated) لمنع استعلام المجهولين
CREATE POLICY "User read own data" ON public.system_users FOR SELECT TO authenticated USING (
    username = (auth.jwt() -> 'user_metadata' ->> 'username')
);

-- =========================================================================
-- 6. سياسات جدول lookup_settings (الإعدادات والقوائم المنسدلة للنظام)
-- =========================================================================

-- القراءة مسموحة لجميع المستخدمين المسجلين وغير المعلقين
CREATE POLICY "Allow authenticated read lookup_settings" 
ON public.lookup_settings 
FOR SELECT 
TO authenticated 
USING (
    (auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' OR
    EXISTS (
        SELECT 1 FROM public.system_users u 
        WHERE u.id = auth.uid() AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
    )
);

-- التعديل/الإضافة/الحذف مسموح فقط للأدمن أو من يملك صلاحيات تعديل صفحة الإدارة
CREATE POLICY "Admin write lookup_settings" 
ON public.lookup_settings 
FOR ALL 
TO authenticated 
USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
    (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'admin' ->> 'edit') = 'true' OR
    EXISTS (
        SELECT 1 FROM public.system_users u 
        WHERE u.id = auth.uid() 
          AND (u.role = 'admin' OR (u.permissions -> 'admin' ->> 'edit') = 'true')
    )
);

-- =========================================================================
-- 7. سياسات جدول orders (الطلبات والبيانات الحساسة للنظام)
-- =========================================================================

-- القراءة: مسموحة لأي مستخدم مسجل يمتلك صلاحية عرض إحدى الصفحات المتعلقة بالطلبات، وغير معلق
CREATE POLICY "Allow authenticated read orders" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'order-reports' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'export' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'receiving' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'factory-portal' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'reports' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'analytics' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'packing-list' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'shipping-invoice' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'warehouse-receipt' ->> 'view') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'entry' ->> 'view') = 'true' OR
              (u.permissions -> 'order-reports' ->> 'view') = 'true' OR
              (u.permissions -> 'export' ->> 'view') = 'true' OR
              (u.permissions -> 'receiving' ->> 'view') = 'true' OR
              (u.permissions -> 'factory-portal' ->> 'view') = 'true' OR
              (u.permissions -> 'reports' ->> 'view') = 'true' OR
              (u.permissions -> 'analytics' ->> 'view') = 'true' OR
              (u.permissions -> 'packing-list' ->> 'view') = 'true' OR
              (u.permissions -> 'shipping-invoice' ->> 'view') = 'true' OR
              (u.permissions -> 'warehouse-receipt' ->> 'view') = 'true'
          )
    )
);

-- الإضافة: مسموحة فقط للمستخدمين الذين يملكون صلاحية الإضافة في صفحة إدخال البيانات
CREATE POLICY "Authenticated insert orders" 
ON public.orders 
FOR INSERT 
TO authenticated 
WITH CHECK (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'add') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'entry' ->> 'add') = 'true'
          )
    )
);

-- التعديل: مسموح فقط للمسؤولين أو من لديه صلاحية التعديل في إدخال البيانات أو استلامات المصنع أو بوابة المصنع
CREATE POLICY "Authenticated update orders" 
ON public.orders 
FOR UPDATE 
TO authenticated 
USING (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'edit') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'receiving' ->> 'edit') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'factory-portal' ->> 'edit') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'entry' ->> 'edit') = 'true' OR
              (u.permissions -> 'receiving' ->> 'edit') = 'true' OR
              (u.permissions -> 'factory-portal' ->> 'edit') = 'true'
          )
    )
)
WITH CHECK (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'edit') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'receiving' ->> 'edit') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'factory-portal' ->> 'edit') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'entry' ->> 'edit') = 'true' OR
              (u.permissions -> 'receiving' ->> 'edit') = 'true' OR
              (u.permissions -> 'factory-portal' ->> 'edit') = 'true'
          )
    )
);

-- الحذف: مسموح فقط للأدمن أو من يملك صلاحية الحذف في صفحة إدخال البيانات
CREATE POLICY "Authenticated delete orders" 
ON public.orders 
FOR DELETE 
TO authenticated 
USING (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'delete') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'entry' ->> 'delete') = 'true'
          )
    )
);

-- =========================================================================
-- 8. سياسات جدول receivings (عمليات الاستلام في المصنع)
-- =========================================================================

-- القراءة: مسموحة للمستخدمين المسجلين الذين لديهم صلاحية عرض صفحة الطلبات أو استلامات المصنع أو التقارير
CREATE POLICY "Allow authenticated read receivings" 
ON public.receivings 
FOR SELECT 
TO authenticated 
USING (
    ((auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'receiving' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'factory-portal' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'entry' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'order-reports' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'reports' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'packing-list' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'shipping-invoice' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'warehouse-receipt' ->> 'view') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'analytics' ->> 'view') = 'true'
    )) OR
    EXISTS (
        SELECT 1 FROM public.system_users u
        WHERE u.id = auth.uid()
          AND (u.permissions ->> '__is_suspended') IS DISTINCT FROM 'true'
          AND (
              u.role = 'admin' OR
              (u.permissions -> 'receiving' ->> 'view') = 'true' OR
              (u.permissions -> 'factory-portal' ->> 'view') = 'true' OR
              (u.permissions -> 'entry' ->> 'view') = 'true' OR
              (u.permissions -> 'order-reports' ->> 'view') = 'true' OR
              (u.permissions -> 'reports' ->> 'view') = 'true' OR
              (u.permissions -> 'packing-list' ->> 'view') = 'true' OR
              (u.permissions -> 'shipping-invoice' ->> 'view') = 'true' OR
              (u.permissions -> 'warehouse-receipt' ->> 'view') = 'true' OR
              (u.permissions -> 'analytics' ->> 'view') = 'true'
          )
    )
);

-- الإضافة والتعديل والحذف: مسموحة للمشرفين والمسؤولين ولمن يملكون صلاحية تعديل الاستلام في المصنع
CREATE POLICY "Allow authenticated write receivings" 
ON public.receivings 
FOR ALL 
TO authenticated 
USING (
    (auth.jwt() -> 'user_metadata' -> 'permissions' ->> '__is_suspended') IS DISTINCT FROM 'true' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'receiving' ->> 'edit') = 'true' OR
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'factory-portal' ->> 'edit') = 'true'
    )
);
