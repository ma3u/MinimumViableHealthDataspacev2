package eu.mvhd.dataplane;

import org.eclipse.dataplane.Dataplane;
import org.eclipse.dataplane.store.Stores;
import org.eclipse.dataplane.store.postgresql.PostgresControlPlaneStore;
import org.eclipse.dataplane.store.postgresql.PostgresDataFlowStore;
import org.postgresql.ds.PGSimpleDataSource;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import javax.sql.DataSource;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

/**
 * The push data plane (ADR-095): Data Plane Signaling on the Eclipse DataPlane
 * SDK, delivering into an SPE inbox of the Neo4j proxy.
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        var config = Config.fromEnvironment();
        Consumer<String> log = line -> System.out.println(Instant.now() + " " + line);
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        var keys = SigningKeys.load(config.signingKeyJwk(), Clock.systemUTC());
        var auth = ControlPlaneTokens.remote(config.signalingJwksUrl(), config.signalingClientId());

        var mapper = mapper();
        StreamTransport transport = config.kafkaBootstrap().isBlank()
                ? null : new KafkaTransport(config.kafkaBootstrap(), config.chunkRecords(), mapper,
                        config.kafkaSecurityProtocol(), config.kafkaLogins());
        var api = assemble(config, keys, auth, transport, executor, log);
        api.start(config.port(), executor);
        log.accept("mvhd-dataplane listens on %d; attestation floor '%s'; store %s; Kafka %s"
                .formatted(config.port(), config.attestationFloor().wire(),
                        config.dbUrl().isBlank() ? "in memory" : "Postgres",
                        transport == null ? "not configured"
                                : config.kafkaBootstrap() + " (" + config.kafkaSecurityProtocol()
                                        + (config.kafkaLogins().shared() ? ", one login" : ", a login per job") + ")"));
    }

    /** Everything but the listening socket, so a test can put it together too. */
    static SignalingApi assemble(Config config, SigningKeys keys, SignalingAuth auth, StreamTransport transport,
                                 ExecutorService executor, Consumer<String> log) throws SQLException, IOException {
        var mapper = mapper();
        var proxy = new ProxyClient(config.proxyUrl(), keys, mapper);
        var logic = new PushLogic(proxy, transport, config.attestationFloor(), config.chunkRecords(),
                config.startWaitSeconds(), config.settleMillis(), mapper, executor, log);

        var builder = Dataplane.newInstance()
                .id("mvhd-dataplane")
                .endpoint(config.publicUrl().resolve("/api/v1"))
                .registerAuthorization(new CallbackAuthorization(keys))
                .onPrepare(logic::onPrepare)
                .onStart(logic::onStart)
                // nothing to release: the inbox closes itself, and a running
                // delivery reads the flow's state between chunks
                .onSuspend(org.eclipse.dataplane.domain.Result::success)
                .onResume(org.eclipse.dataplane.domain.Result::success)
                .onTerminate(org.eclipse.dataplane.domain.Result::success)
                .onCompleted(org.eclipse.dataplane.domain.Result::success)
                .onStarted(logic::onStarted);
        logic.profiles().forEach(builder::profile);
        if (!config.dbUrl().isBlank()) {
            var dataSource = dataSource(config);
            createTables(dataSource);
            builder.stores(new Stores(
                    new PostgresDataFlowStore(mapper, dataSource), new PostgresControlPlaneStore(mapper, dataSource)));
        }
        var dataplane = builder.build();
        logic.attach(dataplane);
        return new SignalingApi(dataplane, auth, keys, config.controlPlaneSignalingUrl(), mapper, log);
    }

    static ObjectMapper mapper() {
        // as the SDK configures its own: tolerant of fields a newer control plane adds
        return JsonMapper.builder()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .changeDefaultPropertyInclusion(incl -> incl.withValueInclusion(NON_NULL))
                .build();
    }

    private static DataSource dataSource(Config config) {
        var dataSource = new PGSimpleDataSource();
        dataSource.setUrl(config.dbUrl());
        dataSource.setUser(config.dbUser());
        dataSource.setPassword(config.dbPassword());
        return dataSource;
    }

    /** The SDK ships its two tables as scripts and leaves running them to us. */
    private static void createTables(DataSource dataSource) throws SQLException, IOException {
        for (var script : new String[]{"sql/data_flow_schema.sql", "sql/control_plane_schema.sql"}) {
            try (var in = Main.class.getClassLoader().getResourceAsStream(script)) {
                if (in == null) {
                    throw new IOException("the SDK's schema " + script + " is not on the classpath");
                }
                var sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                    statement.execute(sql);
                }
            }
        }
    }
}
