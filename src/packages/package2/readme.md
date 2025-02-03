# DataShield Vault - Secure Your Salesforce Data

DataShield Vault is a managed package designed to enhance data security by encrypting sensitive fields in your Salesforce org while maintaining searchability.

## 🔧 Installation & Setup

1. **Install from Your App Store**  
   - Navigate to the **Custom Feature Marketplace** and install DataShield Vault.
   - Select the profiles that need access.

2. **Assign Permissions**  
   - Use the **DataShield Admin** permission set for configuring encryption policies.
   - Assign **DataShield User** permission set to users who need access to encrypted data.

3. **Enable Field Encryption**  
   - Go to **DataShield Vault Setup** in the **App Launcher**.
   - Select objects and fields to encrypt (e.g., **SSN, Credit Card Numbers**).
   - Choose the encryption method and save.

4. **Verify Encryption**  
   - Create or update a record with an encrypted field.
   - Ensure the data is masked for unauthorized users but accessible for permitted roles.

## 🔒 Key Features
- Field-level encryption with **AES-256**  
- Role-based decryption access  
- Logging & compliance tracking  

## 📢 Need Help?  
Check our [Documentation](https://example.com/docs) or contact **support@datashieldvault.com**.
