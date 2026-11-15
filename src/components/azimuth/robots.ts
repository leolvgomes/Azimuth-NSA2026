export function robotLabelPt(role: string): string {
  switch (role) {
    case 'rescue':
      return 'Robô de resgate';
    case 'scout':
      return 'Batedor';
    case 'carrier':
      return 'Transporte';
    case 'relay':
      return 'Relé de comunicação';
    default:
      return role;
  }
}
