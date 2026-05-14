import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  wallet_id: string;
  request_id: string | null;
  type: 'credit' | 'debit' | 'refund' | 'payout' | 'top_up';
  amount: number;
  description: string | null;
  reference_id: string | null;
  status: string;
  created_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      setTransactions([]);
      setLoading(false);
      return;
    }

    fetchWallet();
  }, [user]);

  async function fetchWallet() {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch or create wallet
      let { data: existingWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!existingWallet) {
        const { data: newWallet } = await supabase
          .from('wallets')
          .insert({ user_id: user.id, balance: 0 })
          .select()
          .single();
        existingWallet = newWallet;
      }

      setWallet(existingWallet as Wallet);

      if (existingWallet) {
        // Fetch transactions
        const { data: txns } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('wallet_id', existingWallet.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setTransactions((txns as Transaction[]) || []);
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addMoney(amount: number) {
    if (!wallet || !user) return { error: new Error('No wallet found') };

    try {
      // Update balance
      const newBalance = Number(wallet.balance) + amount;
      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', wallet.id);

      // Create transaction record
      await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          type: 'top_up',
          amount,
          description: 'Added money to wallet',
          status: 'completed'
        });

      await fetchWallet();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  return {
    wallet,
    transactions,
    loading,
    addMoney,
    refetch: fetchWallet
  };
}
