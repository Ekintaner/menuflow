#requires -Version 7.4
param([Parameter(Mandatory)][string]$ComputerIP)
$ErrorActionPreference = 'Stop'
$ip = [System.Net.IPAddress]::Parse($ComputerIP)
if ($ip.AddressFamily -ne 'InterNetwork' -or $ComputerIP -notmatch '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Use the private WiFi IPv4 address.' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$dir = Join-Path (Get-Location) '.wrangler/phone-010'
if (Test-Path $dir) { throw 'Certificate directory already exists. Reuse it; do not replace trust silently.' }
New-Item -ItemType Directory $dir | Out-Null
# Generate a short-lived, dedicated CA in memory. Never persist its signing key.
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$caRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=MenuFlow temporary phone pilot CA', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new('KeyCertSign, CrlSign',$true))
$from = [DateTimeOffset]::UtcNow.AddMinutes(-5)
$ca = $caRequest.CreateSelfSigned($from, $from.AddDays(3))
$key = [System.Security.Cryptography.RSA]::Create(2048)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=MenuFlow local phone pilot', $key, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new('DigitalSignature, KeyEncipherment',$true))
$oids = [System.Security.Cryptography.OidCollection]::new()
$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')) | Out-Null
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$true))
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddIpAddress($ip)
$san.AddIpAddress([System.Net.IPAddress]::Loopback)
$san.AddDnsName('localhost')
$request.CertificateExtensions.Add($san.Build())
$serial = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
$cert = $request.Create($ca, $from, $from.AddDays(2), $serial)
[System.IO.File]::WriteAllText((Join-Path $dir 'ca.pem'), $ca.ExportCertificatePem())
[System.IO.File]::WriteAllBytes((Join-Path $dir 'menuflow-phone-ca.cer'), $ca.Export('Cert'))
[System.IO.File]::WriteAllText((Join-Path $dir 'server.pem'), $cert.ExportCertificatePem())
[System.IO.File]::WriteAllText((Join-Path $dir 'server-key.pem'), $key.ExportPkcs8PrivateKeyPem())
$rsa.Dispose(); $key.Dispose(); $ca.Dispose(); $cert.Dispose()
# Restrict the private key directory to this Windows user and SYSTEM.
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $dir /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict certificate directory ACL.' }
Write-Output 'Certificate prepared; no trust store or firewall was changed. Share ONLY menuflow-phone-ca.cer with your test phone.'
Get-FileHash (Join-Path $dir 'menuflow-phone-ca.cer') -Algorithm SHA256 | Select-Object Hash
