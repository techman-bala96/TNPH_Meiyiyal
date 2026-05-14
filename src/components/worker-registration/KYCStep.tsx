import { useState } from 'react';
import { Shield, CheckCircle, AlertCircle, Video, CreditCard, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface KYCStepProps {
  aadhaarVerified: boolean;
  panVerified: boolean;
  videoVerified: boolean;
  panNumber: string;
  panName: string;
  onPanChange: (field: 'panNumber' | 'panName', value: string) => void;
  onAadhaarVerify: () => void;
  onVideoRecord: () => void;
}

export function KYCStep({
  aadhaarVerified,
  panVerified,
  videoVerified,
  panNumber,
  panName,
  onPanChange,
  onAadhaarVerify,
  onVideoRecord,
}: KYCStepProps) {
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  const formatAadhaar = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 12);
    const parts = [];
    for (let i = 0; i < cleaned.length; i += 4) {
      parts.push(cleaned.slice(i, i + 4));
    }
    return parts.join(' ');
  };

  const formatPan = (value: string) => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Identity Verification (KYC)</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Complete all verification steps to activate your worker profile. This ensures trust and safety for all users.
        </p>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Shield className="w-4 h-4 text-primary" />
        <AlertDescription className="text-sm">
          Your documents are encrypted and stored securely. We follow all Indian data protection regulations.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {/* Aadhaar Verification */}
        <Card className={`transition-all ${aadhaarVerified ? 'border-green-500' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Aadhaar OTP Verification</CardTitle>
              </div>
              {aadhaarVerified ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  Required
                </span>
              )}
            </div>
            <CardDescription>Verify your identity using Aadhaar-linked mobile OTP</CardDescription>
          </CardHeader>
          <CardContent>
            {!aadhaarVerified && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aadhaar">Aadhaar Number</Label>
                  <Input
                    id="aadhaar"
                    placeholder="XXXX XXXX XXXX"
                    value={formatAadhaar(aadhaarNumber)}
                    onChange={(e) => setAadhaarNumber(e.target.value.replace(/\s/g, ''))}
                    maxLength={14}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full gradient-primary"
                  onClick={onAadhaarVerify}
                  disabled={aadhaarNumber.length !== 12}
                >
                  Send OTP to Linked Mobile
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  OTP will be sent to the mobile number linked with your Aadhaar
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PAN Verification */}
        <Card className={`transition-all ${panVerified ? 'border-green-500' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">PAN Details</CardTitle>
              </div>
              {panVerified ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  Required
                </span>
              )}
            </div>
            <CardDescription>Submit your PAN for tax compliance and payment processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="panNumber">PAN Number</Label>
                <Input
                  id="panNumber"
                  placeholder="ABCDE1234F"
                  value={formatPan(panNumber)}
                  onChange={(e) => onPanChange('panNumber', formatPan(e.target.value))}
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panName">Name as per PAN</Label>
                <Input
                  id="panName"
                  placeholder="Your full name as on PAN card"
                  value={panName}
                  onChange={(e) => onPanChange('panName', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Video Verification */}
        <Card className={`transition-all ${videoVerified ? 'border-green-500' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Video Verification</CardTitle>
              </div>
              {videoVerified ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  Required
                </span>
              )}
            </div>
            <CardDescription>Record a short video for liveness check and face verification</CardDescription>
          </CardHeader>
          <CardContent>
            {!videoVerified && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
                  <p className="font-medium">Instructions:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Ensure good lighting on your face</li>
                    <li>Look directly at the camera</li>
                    <li>Follow the on-screen prompts</li>
                    <li>Video will be ~10 seconds</li>
                  </ul>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={onVideoRecord}
                >
                  <Video className="w-4 h-4 mr-2" />
                  Start Video Recording
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
