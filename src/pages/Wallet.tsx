import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, RefreshCw } from 'lucide-react';

export default function Wallet() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet, transactions, loading, addMoney, refetch } = useWallet();
  const { toast } = useToast();
  const [addAmount, setAddAmount] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleAddMoney = async () => {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    const { error } = await addMoney(amount);
    setProcessing(false);

    if (error) {
      toast({ title: 'Failed to add money', variant: 'destructive' });
    } else {
      toast({ title: `₹${amount} added to wallet` });
      setAddAmount('');
      setDialogOpen(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <PageLayout title="Wallet" subtitle="Manage your balance" backPath="/dashboard">
        <div className="space-y-6 pb-24">
          {/* Balance Card */}
          <Card className="gradient-primary text-white">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Available Balance</p>
                  <p className="text-4xl font-bold">₹{wallet?.balance?.toFixed(2) || '0.00'}</p>
                </div>
                <WalletIcon className="w-12 h-12 text-white/50" />
              </div>
              
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full mt-4 bg-white/20 hover:bg-white/30 border-0">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Money
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Money to Wallet</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="flex gap-2">
                      {[100, 500, 1000, 2000].map(amt => (
                        <Button
                          key={amt}
                          variant="outline"
                          size="sm"
                          onClick={() => setAddAmount(amt.toString())}
                        >
                          ₹{amt}
                        </Button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                    />
                    <Button 
                      className="w-full gradient-primary" 
                      onClick={handleAddMoney}
                      disabled={processing}
                    >
                      {processing ? 'Processing...' : 'Add Money'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Transaction History</CardTitle>
                <Button variant="ghost" size="icon" onClick={refetch}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex gap-3">
                      <div className="w-10 h-10 bg-muted rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/2" />
                        <div className="h-3 bg-muted rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <WalletIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map(txn => {
                    const isCredit = ['credit', 'top_up', 'refund'].includes(txn.type);
                    return (
                      <div key={txn.id} className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isCredit ? 'bg-success/10' : 'bg-destructive/10'
                        }`}>
                          {isCredit ? (
                            <ArrowDownLeft className="w-5 h-5 text-success" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {txn.description || txn.type.replace('_', ' ').toUpperCase()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(txn.created_at)}
                          </p>
                        </div>
                        <p className={`font-semibold ${isCredit ? 'text-success' : 'text-destructive'}`}>
                          {isCredit ? '+' : '-'}₹{Math.abs(txn.amount).toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageLayout>
      <BottomNav />
    </>
  );
}
