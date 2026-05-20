import { createClient } from '@supabase/supabase-js';

const url = 'https://gsinwkfcefngpzyshtor.supabase.co';
const key = 'sb_publishable_Ck5w11_ZAWaVNTsjp9bDhA_AsKc-3-O';
const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@greenhand.local',
    password: '123456'
  });
  if (error) {
    console.error("Login failed:", error);
    return;
  }
  
  // Sync metadata
  await supabase.auth.updateUser({
    data: {
      username: 'admin',
      role: 'admin',
      allowed_pages: [],
      permissions: {
        __is_suspended: false,
        admin: { edit: true, view: true, delete: true }
      }
    }
  });
  await supabase.auth.refreshSession();

  // Print all orders serial numbers
  const { data: orders, error: ordersErr } = await supabase.from('orders').select('serial_number');
  if (ordersErr) {
    console.error("Error reading orders:", ordersErr);
  } else {
    console.log("Orders serial numbers:", orders.map(o => o.serial_number));
  }

  // Print all receivings serial numbers and receive_data status
  const { data: recs, error: recsErr } = await supabase.from('receivings').select('serial_number, receive_data');
  if (recsErr) {
    console.error("Error reading receivings:", recsErr);
  } else {
    console.log("Receivings serials and data:", recs.map(r => ({
      serial_number: r.serial_number,
      status: r.receive_data?.status
    })));
  }
}

test();
