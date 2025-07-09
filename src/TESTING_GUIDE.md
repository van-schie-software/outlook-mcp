# Testing Guide for Zendesk MCP Server

Dit document beschrijft hoe je de tests voor de Zendesk MCP Server kunt uitvoeren en begrijpen.

## Overzicht

We hebben twee soorten tests geïmplementeerd:

1. **Unit Tests** (`src/zendesk-client.test.ts`): Testen de `ZendeskClientWrapper` in isolatie
2. **Integration Tests** (`src/index.test.ts`): Testen de integratie tussen MCP en Zendesk

## Het Test Framework

We gebruiken **Vitest**, een modern en snel test framework dat goed werkt met TypeScript.

### Installatie

De test dependencies zijn al geïnstalleerd. Als je ze opnieuw moet installeren:

```bash
npm install --save-dev vitest
```

## Unit Tests Uitvoeren

Om alle unit tests uit te voeren:

```bash
npm test
```

Dit voert alleen de unit tests uit (integration tests worden momenteel overgeslagen vanwege Cloudflare Workers specifieke imports).

### Wat Testen de Unit Tests?

De unit tests in `src/zendesk-client.test.ts` testen:

1. **get_ticket**: 
   - Correct aanroepen van de Zendesk API
   - Juiste formattering van ticket data
   - Error handling

2. **get_ticket_comments**:
   - Ophalen en formatteren van ticket comments
   - Onderscheid tussen publieke en private comments

3. **create_ticket_comment**:
   - Aanmaken van publieke comments
   - Aanmaken van private comments

4. **getKnowledgeBase**:
   - Ophalen van knowledge base artikelen
   - Caching mechanisme
   - Omgaan met lege secties

5. **Constructor validatie**:
   - Controleert of alle vereiste environment variables aanwezig zijn

## De Mock Strategie

### Waarom Mocken?

We mocken de `node-zendesk` library om:
- Tests snel te houden (geen echte API calls)
- Tests betrouwbaar te maken (geen afhankelijkheid van externe services)
- Verschillende scenarios te kunnen testen (inclusief errors)

### Hoe Werkt het Mocken?

```typescript
// We creëren mock functies voor elke Zendesk API methode
const mockShowTicket = vi.fn();
const mockGetComments = vi.fn();

// We vertellen Vitest om onze mock te gebruiken in plaats van de echte library
vi.mock('node-zendesk', () => ({
  default: {
    createClient: vi.fn(() => ({
      tickets: {
        show: mockShowTicket,
        getComments: mockGetComments,
        // ... etc
      }
    }))
  }
}));
```

### Het "Arrange, Act, Assert" Patroon

Elke test volgt dit patroon:

```typescript
it('should do something', async () => {
  // ARRANGE: Stel de test op
  mockShowTicket.mockResolvedValue({ result: { id: 123 } });
  const client = new ZendeskClientWrapper(env);

  // ACT: Voer de actie uit
  const ticket = await client.get_ticket(123);

  // ASSERT: Controleer het resultaat
  expect(ticket.id).toBe(123);
  expect(mockShowTicket).toHaveBeenCalledWith(123);
});
```

## Integration Tests

De integration tests in `src/index.test.ts` zijn momenteel uitgeschakeld vanwege Cloudflare Workers specifieke imports. Ze testen:

- Tool registratie in de MCP server
- Correct doorgeven van parameters aan de Zendesk client
- Error handling op MCP niveau
- HTTP request handling

Om deze in de toekomst te activeren, moet de Cloudflare Workers omgeving correct gemockt worden.

## Test Coverage

Om te zien welke delen van je code gedekt zijn door tests:

```bash
npm test -- --coverage
```

## Best Practices

1. **Isolatie**: Elke test moet onafhankelijk zijn
2. **Duidelijke Namen**: Test namen beschrijven wat ze testen
3. **Mock Reset**: Voor elke test worden mocks gereset met `beforeEach`
4. **Error Scenarios**: Test niet alleen het "happy path" maar ook error scenarios

## Nieuwe Tests Toevoegen

Bij het toevoegen van nieuwe functionaliteit:

1. Schrijf eerst de test (Test Driven Development)
2. Implementeer de functionaliteit
3. Zorg dat de test slaagt
4. Refactor indien nodig

### Voorbeeld: Nieuwe Zendesk Methode Testen

```typescript
describe('nieuwe_methode', () => {
  it('should call the API correctly', async () => {
    // ARRANGE
    const mockNewMethod = vi.fn();
    // Voeg de mock toe aan de client setup
    
    // ACT
    await client.nieuwe_methode(params);
    
    // ASSERT
    expect(mockNewMethod).toHaveBeenCalledWith(expected_params);
  });
});
```

## Troubleshooting

### Test Faalt: "Cannot find module"
- Controleer of alle dependencies geïnstalleerd zijn
- Controleer of het pad naar de module correct is

### Mock Werkt Niet
- Zorg dat de mock voor de import van de module staat
- Controleer of de mock structuur overeenkomt met de echte module

### Tests Zijn Traag
- Controleer of er geen echte API calls worden gedaan
- Gebruik `vi.clearAllMocks()` in `beforeEach`

## Continue Integratie

Voor productie gebruik, overweeg om tests automatisch uit te voeren:

1. Bij elke commit (pre-commit hook)
2. Bij elke pull request (GitHub Actions)
3. Voor deployment (CI/CD pipeline)

## Conclusie

Tests zijn essentieel voor betrouwbare software. Deze test suite zorgt ervoor dat:
- De Zendesk integratie correct werkt
- Toekomstige wijzigingen geen bestaande functionaliteit breken
- De code maintainable blijft

Bij vragen of problemen, raadpleeg de Vitest documentatie: https://vitest.dev/